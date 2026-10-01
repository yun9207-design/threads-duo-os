begin;
-- Additive P1 data; existing Auth, membership and publishing policies are unchanged.
alter table public.drafts add constraint drafts_ai_id_workspace_unique unique(id,workspace_id);
create table public.ai_generation_jobs (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  request_hash text not null check(length(request_hash)=64),
  topic text not null check(char_length(topic) between 1 and 180),
  purpose text not null check(char_length(purpose) between 1 and 40),
  tone text not null check(char_length(tone) between 1 and 40),
  mode text not null check(mode in ('single','multiple','series')),
  post_count integer not null check(post_count between 1 and 30),
  parameters jsonb not null check(jsonb_typeof(parameters)='object' and pg_column_size(parameters)<=16384),
  model text not null check(char_length(model) between 1 and 100),
  status text not null default 'generating' check(status in ('generating','completed','failed')),
  results jsonb, error text check(char_length(error)<=500),
  created_at timestamptz not null default now(), completed_at timestamptz,
  unique(id,workspace_id),
  check(results is null or (jsonb_typeof(results)='array' and jsonb_array_length(results)<=30 and pg_column_size(results)<=131072))
);
create index ai_jobs_workspace_created_idx on public.ai_generation_jobs(workspace_id,created_at desc);
create index ai_jobs_actor_idx on public.ai_generation_jobs(actor_user_id);

create table public.ai_generated_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  generation_id uuid not null,
  position integer not null check(position between 1 and 30),
  label text not null check(char_length(label)<=100), angle text not null check(char_length(angle) between 1 and 200),
  body text not null check(char_length(btrim(body)) between 1 and 500),
  draft_id uuid, deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default clock_timestamp(),
  foreign key(generation_id,workspace_id) references public.ai_generation_jobs(id,workspace_id) on delete cascade,
  foreign key(draft_id,workspace_id) references public.drafts(id,workspace_id) on delete restrict,
  unique(generation_id,position), unique(draft_id)
);
create index ai_posts_workspace_created_idx on public.ai_generated_posts(workspace_id,created_at desc);

create table public.content_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check(char_length(btrim(name)) between 1 and 60),
  instruction text not null check(char_length(btrim(instruction)) between 1 and 1200),
  purpose text not null check(char_length(purpose) between 1 and 40),
  tone text not null check(char_length(tone) between 1 and 40),
  created_at timestamptz not null default now(), updated_at timestamptz not null default clock_timestamp(), deleted_at timestamptz
);
create index content_templates_workspace_idx on public.content_templates(workspace_id,created_at desc);
create index content_templates_creator_idx on public.content_templates(created_by);

alter table public.ai_generation_jobs enable row level security;
alter table public.ai_generated_posts enable row level security;
alter table public.content_templates enable row level security;
revoke all on public.ai_generation_jobs,public.ai_generated_posts,public.content_templates from public,anon,authenticated;
grant select on public.ai_generation_jobs,public.ai_generated_posts,public.content_templates to authenticated;
grant insert(id,workspace_id,actor_user_id,request_hash,topic,purpose,tone,mode,post_count,parameters,model) on public.ai_generation_jobs to authenticated;
grant update(status,results,error,completed_at) on public.ai_generation_jobs to authenticated;
grant insert(workspace_id,generation_id,position,label,angle,body) on public.ai_generated_posts to authenticated;
grant update(body,draft_id,deleted_at) on public.ai_generated_posts to authenticated;
grant insert(workspace_id,created_by,name,instruction,purpose,tone) on public.content_templates to authenticated;
grant update(name,instruction,purpose,tone,deleted_at) on public.content_templates to authenticated;

create policy ai_jobs_member_read on public.ai_generation_jobs for select to authenticated
  using(workspace_id in(select private.current_workspace_ids()));
create policy ai_jobs_actor_insert on public.ai_generation_jobs for insert to authenticated
  with check(actor_user_id=(select auth.uid()) and workspace_id in(select private.current_workspace_ids()));
create policy ai_jobs_actor_update on public.ai_generation_jobs for update to authenticated
  using(actor_user_id=(select auth.uid()) and workspace_id in(select private.current_workspace_ids()))
  with check(actor_user_id=(select auth.uid()) and workspace_id in(select private.current_workspace_ids()));
create policy ai_posts_member_read on public.ai_generated_posts for select to authenticated
  using(workspace_id in(select private.current_workspace_ids()));
create policy ai_posts_actor_insert on public.ai_generated_posts for insert to authenticated
  with check(workspace_id in(select private.current_workspace_ids()) and exists(select 1 from public.ai_generation_jobs j
    where j.id=generation_id and j.workspace_id=ai_generated_posts.workspace_id and j.actor_user_id=(select auth.uid()) and j.status='generating'));
create policy ai_posts_member_update on public.ai_generated_posts for update to authenticated
  using(workspace_id in(select private.current_workspace_ids())) with check(workspace_id in(select private.current_workspace_ids()));
create policy templates_member_read on public.content_templates for select to authenticated
  using(workspace_id in(select private.current_workspace_ids()));
create policy templates_creator_insert on public.content_templates for insert to authenticated
  with check(created_by=(select auth.uid()) and workspace_id in(select private.current_workspace_ids()));
create policy templates_member_update on public.content_templates for update to authenticated
  using(workspace_id in(select private.current_workspace_ids())) with check(workspace_id in(select private.current_workspace_ids()));

create function private.ai_content_updated() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at:=clock_timestamp(); return new; end $$;
revoke all on function private.ai_content_updated() from public,anon,authenticated;
create trigger ai_posts_updated before update on public.ai_generated_posts for each row execute function private.ai_content_updated();
create trigger content_templates_updated before update on public.content_templates for each row execute function private.ai_content_updated();

-- One paid generation per reservation. All statuses count toward a bounded workspace allowance.
create function public.reserve_ai_generation(p_workspace_id uuid,p_id uuid,p_hash text,p_parameters jsonb,p_model text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.ai_generation_jobs; requested integer; begin
  if not p_workspace_id in(select private.current_workspace_ids()) then raise exception 'Workspace denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,1));
  select * into j from public.ai_generation_jobs where id=p_id and workspace_id=p_workspace_id;
  if found then
    if j.request_hash<>p_hash or j.actor_user_id<>auth.uid() then raise exception 'Request conflict' using errcode='55000'; end if;
    return jsonb_build_object('claimed',false,'job',to_jsonb(j));
  end if;
  requested:=(p_parameters->>'count')::integer;
  if requested is null or requested not between 1 and 30 then raise exception 'Invalid count' using errcode='22023'; end if;
  if exists(select 1 from public.ai_generation_jobs where workspace_id=p_workspace_id and status='generating' and created_at>now()-interval '3 minutes')
    or (select coalesce(sum(post_count),0) from public.ai_generation_jobs where workspace_id=p_workspace_id and created_at>now()-interval '1 hour')+requested>120
    or (select coalesce(sum(post_count),0) from public.ai_generation_jobs where workspace_id=p_workspace_id and created_at>now()-interval '24 hours')+requested>300 then
    raise exception 'Generation allowance reached' using errcode='P0001';
  end if;
  insert into public.ai_generation_jobs(id,workspace_id,actor_user_id,request_hash,topic,purpose,tone,mode,post_count,parameters,model)
    values(p_id,p_workspace_id,auth.uid(),p_hash,p_parameters->>'topic',p_parameters->>'purpose',p_parameters->>'tone',
      p_parameters->>'mode',requested,p_parameters,p_model) returning * into j;
  return jsonb_build_object('claimed',true,'job',to_jsonb(j));
end $$;

create function public.finish_ai_generation(p_workspace_id uuid,p_id uuid,p_posts jsonb)
returns setof public.ai_generated_posts language plpgsql security invoker set search_path='' as $$
declare j public.ai_generation_jobs; item jsonb; n integer:=0; begin
  select * into j from public.ai_generation_jobs where id=p_id and workspace_id=p_workspace_id and actor_user_id=auth.uid() and status='generating' for update;
  if not found then raise exception 'Generation not available' using errcode='55000'; end if;
  if jsonb_typeof(p_posts) is distinct from 'array' or jsonb_array_length(p_posts)<>j.post_count then raise exception 'Count mismatch' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_posts) loop
    n:=n+1;
    return query insert into public.ai_generated_posts(workspace_id,generation_id,position,label,angle,body)
      values(p_workspace_id,p_id,n,item->>'label',item->>'angle',item->>'body') returning *;
  end loop;
  update public.ai_generation_jobs set status='completed',results=p_posts,completed_at=clock_timestamp() where id=j.id;
end $$;

-- Attach AI records to existing drafts atomically; repeated scheduling updates the same draft.
create function public.save_ai_posts(p_workspace_id uuid,p_posts jsonb)
returns setof public.drafts language plpgsql security invoker set search_path='' as $$
declare item jsonb; source public.ai_generated_posts; saved public.drafts; begin
  if jsonb_typeof(p_posts) is distinct from 'array' or jsonb_array_length(p_posts) not between 1 and 30
    or (select count(distinct value->>'id') from jsonb_array_elements(p_posts))<>jsonb_array_length(p_posts) then
    raise exception 'Invalid AI selection' using errcode='22023'; end if;
  -- Same workspace lock order as save_product_post, then stable AI row locks.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
  perform 1 from public.ai_generated_posts where workspace_id=p_workspace_id and id in
    (select (value->>'id')::uuid from jsonb_array_elements(p_posts)) order by id for update;
  for item in select value from jsonb_array_elements(p_posts) loop
    select * into source from public.ai_generated_posts where id=(item->>'id')::uuid and workspace_id=p_workspace_id
      and updated_at=(item->>'expectedUpdatedAt')::timestamptz and deleted_at is null;
    if not found then raise exception 'AI post changed' using errcode='55000'; end if;
    if item->>'mode'='now' and jsonb_array_length(p_posts)>1 then raise exception 'One immediate post only' using errcode='22023'; end if;
    select * into saved from public.save_product_post(p_workspace_id,item->>'body',item->>'mode',
      source.draft_id,nullif(item->>'draftUpdatedAt','')::timestamptz,
      nullif(item->>'scheduledAt','')::timestamptz,nullif(item->>'accountId','')::uuid,coalesce((item->>'allowDuplicate')::boolean,false));
    update public.ai_generated_posts set body=saved.body,draft_id=saved.id where id=source.id;
    return next saved;
  end loop;
end $$;
revoke all on function public.reserve_ai_generation(uuid,uuid,text,jsonb,text),public.finish_ai_generation(uuid,uuid,jsonb),public.save_ai_posts(uuid,jsonb) from public,anon;
grant execute on function public.reserve_ai_generation(uuid,uuid,text,jsonb,text),public.finish_ai_generation(uuid,uuid,jsonb),public.save_ai_posts(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
