begin;
create table public.content_categories (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(trim(name)) between 1 and 40), color text not null default '#f17950' check(color ~ '^#[0-9a-fA-F]{6}$'),
 created_by uuid references public.profiles(id), archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,workspace_id)
);
create unique index content_category_name on public.content_categories(workspace_id,lower(name)) where archived_at is null;
insert into public.content_categories(workspace_id,name,color)
 select w.id,c.name,c.color from public.workspaces w cross join (values
 ('정보','#5085cb'),('팁','#43a18d'),('교육','#8270c8'),('질문','#d59532'),('공감','#d57692'),('경험','#9b7751'),
 ('브랜드','#526887'),('제품','#ed7950'),('홍보','#d35c6d'),('유입','#438ea1'),('커뮤니티','#799b58'),('기타','#88929f')) c(name,color);
alter table public.drafts add column category_id uuid;
alter table public.drafts add constraint drafts_category_workspace foreign key(category_id,workspace_id) references public.content_categories(id,workspace_id);
create index drafts_category on public.drafts(workspace_id,category_id) where deleted_at is null;
grant update(category_id) on public.drafts to authenticated;

create table public.content_plans (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), created_by uuid not null references public.profiles(id), request_id uuid not null unique,
 business text not null check(length(business) between 1 and 180), goal text not null check(length(goal) between 1 and 500), audience text not null default '' check(length(audience)<=200),
 start_date date not null,end_date date not null, target_count integer not null check(target_count between 1 and 30),
 mix jsonb not null default '{}', items jsonb not null default '[]' check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=30),
 status text not null default 'planning' check(status in('planning','ready','scheduled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(end_date>=start_date and end_date-start_date<=31), unique(id,workspace_id)
);
create index content_plans_period on public.content_plans(workspace_id,start_date,end_date);
create table public.recurring_schedules (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),created_by uuid not null references public.profiles(id),
 name text not null check(length(trim(name)) between 1 and 100),days integer[] not null check(cardinality(days) between 1 and 7 and days <@ array[0,1,2,3,4,5,6]),
 time_of_day time not null,category_id uuid,template_id text not null default '' check(length(template_id)<=80),content_type text not null default '정보 전달' check(length(content_type)<=100),
 enabled boolean not null default true,start_date date not null,end_date date,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(end_date is null or end_date>=start_date),foreign key(category_id,workspace_id) references public.content_categories(id,workspace_id),unique(id,workspace_id)
);
create index recurring_workspace on public.recurring_schedules(workspace_id) where enabled;
create table public.recurring_occurrences (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null, schedule_id uuid not null,scheduled_at timestamptz not null,draft_id uuid not null,
 created_at timestamptz not null default now(),unique(schedule_id,scheduled_at),unique(draft_id),
 foreign key(schedule_id,workspace_id) references public.recurring_schedules(id,workspace_id),foreign key(draft_id,workspace_id) references public.drafts(id,workspace_id)
);
create index recurring_occurrence_workspace on public.recurring_occurrences(workspace_id,scheduled_at);
create table public.draft_insights (
 draft_id uuid primary key,workspace_id uuid not null,views bigint check(views>=0),likes bigint check(likes>=0),replies bigint check(replies>=0),
 reposts bigint check(reposts>=0),quotes bigint check(quotes>=0),engagement_rate numeric check(engagement_rate>=0),followers_delta bigint,
 fetched_at timestamptz,source text not null default 'threads',foreign key(draft_id,workspace_id) references public.drafts(id,workspace_id)
);
do $$ declare t text; begin
 foreach t in array array['content_categories','content_plans','recurring_schedules','recurring_occurrences','draft_insights'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using(workspace_id in(select private.current_workspace_ids()))',t||'_read',t);
 end loop;
 foreach t in array array['content_categories','content_plans','recurring_schedules'] loop
  execute format('create policy %I on public.%I for insert to authenticated with check(created_by=(select auth.uid()) and workspace_id in(select private.current_workspace_ids()))',t||'_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using(workspace_id in(select private.current_workspace_ids())) with check(workspace_id in(select private.current_workspace_ids()))',t||'_update',t);
  execute format('create trigger %I before update on public.%I for each row execute function private.ai_content_updated()',t||'_updated',t);
 end loop;
end $$;
grant insert(workspace_id,created_by,name,color), update(name,color,archived_at) on public.content_categories to authenticated;
grant insert(workspace_id,created_by,request_id,business,goal,audience,start_date,end_date,target_count,mix,items,status),update(items,status,business,goal,audience,mix,target_count) on public.content_plans to authenticated;
grant insert(workspace_id,created_by,name,days,time_of_day,category_id,template_id,content_type,enabled,start_date,end_date),
 update(name,days,time_of_day,category_id,template_id,content_type,enabled,start_date,end_date) on public.recurring_schedules to authenticated;
grant insert(workspace_id,schedule_id,scheduled_at,draft_id) on public.recurring_occurrences to authenticated;
create policy recurring_occurrences_insert on public.recurring_occurrences for insert to authenticated with check(workspace_id in(select private.current_workspace_ids()));

-- Add categories without replacing the existing CRUD or publishing engine.
create function public.save_categorized_posts(p_workspace_id uuid,p_posts jsonb,p_ai boolean default false)
 returns setof public.drafts language plpgsql security invoker set search_path='' as $$
declare item jsonb; saved public.drafts; category uuid; begin
 if jsonb_typeof(p_posts) is distinct from 'array' or jsonb_array_length(p_posts) not between 1 and 30 then raise exception 'Invalid posts' using errcode='22023'; end if;
 if p_ai and (select count(distinct value->>'id') from jsonb_array_elements(p_posts))<>jsonb_array_length(p_posts) then raise exception 'Duplicate AI id' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
 for item in select value from jsonb_array_elements(p_posts) loop
  if p_ai then select * into saved from public.save_ai_posts(p_workspace_id,jsonb_build_array(item));
  else select * into saved from public.save_product_post(p_workspace_id,item->>'body',item->>'mode',nullif(item->>'draftId','')::uuid,
   nullif(item->>'expectedUpdatedAt','')::timestamptz,nullif(item->>'scheduledAt','')::timestamptz,nullif(item->>'accountId','')::uuid,coalesce((item->>'allowDuplicate')::boolean,false)); end if;
  if item ? 'categoryId' then
   category:=nullif(item->>'categoryId','')::uuid;
   if category is not null and not exists(select 1 from public.content_categories where id=category and workspace_id=p_workspace_id and archived_at is null) then raise exception 'Category unavailable' using errcode='23503'; end if;
   update public.drafts set category_id=category where id=saved.id and workspace_id=p_workspace_id returning * into saved;
  end if;
  return next saved;
 end loop;
end $$;
create function public.place_content_plan(p_workspace_id uuid,p_plan_id uuid,p_expected_updated_at timestamptz,p_posts jsonb)
 returns setof public.drafts language plpgsql security invoker set search_path='' as $$
declare plan public.content_plans; saved public.drafts; item jsonb; updated_items jsonb:='[]'; slot uuid; begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
 select * into plan from public.content_plans where id=p_plan_id and workspace_id=p_workspace_id and updated_at=p_expected_updated_at for update;
 if not found or plan.status='scheduled' then raise exception 'Plan changed or already scheduled' using errcode='55000'; end if;
 if jsonb_array_length(p_posts)<>jsonb_array_length(plan.items) or jsonb_array_length(p_posts)=0 then raise exception 'Incomplete plan' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_posts) loop
  if item->>'mode'<>'schedule' or not exists(select 1 from jsonb_array_elements(plan.items) i where i->>'aiPostId'=item->>'id') then raise exception 'Review required' using errcode='22023'; end if;
  if exists(select 1 from public.drafts where workspace_id=p_workspace_id and scheduled_at=(item->>'scheduledAt')::timestamptz and deleted_at is null and publication_status<>'failed') then raise exception 'Slot occupied' using errcode='55000'; end if;
 end loop;
 if (select count(distinct value->>'scheduledAt') from jsonb_array_elements(p_posts))<>jsonb_array_length(p_posts) then raise exception 'Duplicate time' using errcode='22023'; end if;
 for saved in select * from public.save_categorized_posts(p_workspace_id,p_posts,true) loop
  select i into item from jsonb_array_elements(plan.items) i join public.ai_generated_posts a on a.id=(i->>'aiPostId')::uuid where a.draft_id=saved.id;
  updated_items:=updated_items||jsonb_build_array(item||jsonb_build_object('draftId',saved.id,'scheduledAt',saved.scheduled_at,'body',saved.body));
  select id into slot from public.recurring_schedules where workspace_id=p_workspace_id and enabled and category_id is not distinct from saved.category_id
   and extract(dow from saved.scheduled_at at time zone 'Asia/Seoul')::integer=any(days)
   and time_of_day=(saved.scheduled_at at time zone 'Asia/Seoul')::time and start_date<=(saved.scheduled_at at time zone 'Asia/Seoul')::date
   and (end_date is null or end_date>=(saved.scheduled_at at time zone 'Asia/Seoul')::date) order by id limit 1;
  if slot is not null then insert into public.recurring_occurrences(workspace_id,schedule_id,scheduled_at,draft_id) values(p_workspace_id,slot,saved.scheduled_at,saved.id); end if;
  return next saved;
 end loop;
 update public.content_plans set items=updated_items,status='scheduled' where id=plan.id;
end $$;
revoke all on function public.save_categorized_posts(uuid,jsonb,boolean),public.place_content_plan(uuid,uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.save_categorized_posts(uuid,jsonb,boolean),public.place_content_plan(uuid,uuid,timestamptz,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
