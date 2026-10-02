begin;
create table public.threads_post_insight_snapshots(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  draft_id uuid not null,
  account_id uuid not null,
  after_hours integer not null check(after_hours in (1,6,24,72,168)),
  fetched_at timestamptz not null default now(),
  views bigint check(views>=0),likes bigint check(likes>=0),replies bigint check(replies>=0),
  reposts bigint check(reposts>=0),quotes bigint check(quotes>=0),shares bigint check(shares>=0),
  unavailable jsonb not null default '{}',
  unique(draft_id,after_hours),
  foreign key(draft_id,workspace_id) references public.drafts(id,workspace_id),
  foreign key(account_id,workspace_id) references public.threads_accounts(id,workspace_id)
);
create index threads_insight_workspace_recent on public.threads_post_insight_snapshots(workspace_id,fetched_at desc);
create table public.account_insight_snapshots(
  workspace_id uuid not null references public.workspaces(id),account_id uuid not null,
  date date not null,fetched_at timestamptz not null default now(),
  followers_count bigint check(followers_count>=0),views bigint check(views>=0),likes bigint check(likes>=0),
  replies bigint check(replies>=0),reposts bigint check(reposts>=0),quotes bigint check(quotes>=0),
  unavailable jsonb not null default '{}',
  primary key(account_id,date),foreign key(account_id,workspace_id) references public.threads_accounts(id,workspace_id)
);
create index account_insight_workspace_date on public.account_insight_snapshots(workspace_id,date desc);
alter table public.threads_post_insight_snapshots enable row level security;
alter table public.account_insight_snapshots enable row level security;
revoke all on public.threads_post_insight_snapshots,public.account_insight_snapshots from public,anon,authenticated;
grant select on public.threads_post_insight_snapshots,public.account_insight_snapshots to authenticated;
create policy post_insights_member_read on public.threads_post_insight_snapshots for select to authenticated
  using(workspace_id in(select private.current_workspace_ids()));
create policy account_insights_member_read on public.account_insight_snapshots for select to authenticated
  using(workspace_id in(select private.current_workspace_ids()));
create table private.threads_insight_jobs(
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null,draft_id uuid not null,account_id uuid not null,
  after_hours integer not null check(after_hours in (1,6,24,72,168)),due_at timestamptz not null,
  state text not null default 'pending' check(state in ('pending','collecting','completed','skipped','unavailable')),
  attempts integer not null default 0,lease_until timestamptz,next_attempt_at timestamptz not null default now(),
  unique(draft_id,after_hours),foreign key(draft_id,workspace_id) references public.drafts(id,workspace_id),
  foreign key(account_id,workspace_id) references public.threads_accounts(id,workspace_id)
);
create table private.threads_insight_sync(
  workspace_id uuid primary key references public.workspaces(id),next_run_at timestamptz not null default now()
);
alter table private.threads_insight_jobs enable row level security;
alter table private.threads_insight_sync enable row level security;
revoke all on private.threads_insight_jobs,private.threads_insight_sync from public,anon,authenticated;
create function private.seed_threads_insights() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.publication_status='published' and old.publication_status<>'published' then
    insert into private.threads_insight_jobs(workspace_id,draft_id,account_id,after_hours,due_at)
      select new.workspace_id,new.id,new.threads_account_id,h,new.published_at+make_interval(hours=>h)
      from unnest(array[1,6,24,72,168]) h on conflict(draft_id,after_hours) do nothing;
  end if;
  return new;
end $$;
revoke all on function private.seed_threads_insights() from public,anon,authenticated;
create trigger drafts_seed_threads_insights after update of publication_status on public.drafts
  for each row execute function private.seed_threads_insights();
insert into private.threads_insight_jobs(workspace_id,draft_id,account_id,after_hours,due_at)
  select d.workspace_id,d.id,d.threads_account_id,h,d.published_at+make_interval(hours=>h)
  from public.drafts d cross join unnest(array[1,6,24,72,168]) h
  where d.publication_status='published' and d.threads_post_id ~ '^[0-9]+$' and d.threads_account_id is not null;

create function private.threads_insight_operation(p_workspace_id uuid,p_secret text,p_operation text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.threads_accounts; job private.threads_insight_jobs; lease timestamptz; metric text; v jsonb; yesterday date; begin
  if not exists(select 1 from private.threads_publishing_config c where c.workspace_id=p_workspace_id
    and char_length(p_secret)>=43 and c.secret_digest=sha256(convert_to(p_secret,'UTF8')))
    or (auth.uid() is not null and not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.profile_id=auth.uid())) then
    raise exception 'Server capability required' using errcode='42501'; end if;
  select * into a from public.threads_accounts where workspace_id=p_workspace_id;
  if p_operation='claim' then
    if a.id is null or a.connection_status not in ('connected','expiring') or a.token_expires_at<=clock_timestamp()
      or not a.granted_permissions @> array['threads_basic','threads_manage_insights'] then return 'null'::jsonb; end if;
    insert into private.threads_insight_sync values(p_workspace_id,now()) on conflict do nothing;
    select next_run_at into lease from private.threads_insight_sync where workspace_id=p_workspace_id for update;
    if lease>clock_timestamp() then return 'null'::jsonb; end if;
    update private.threads_insight_sync set next_run_at=clock_timestamp()+interval '10 minutes' where workspace_id=p_workspace_id;
    -- Coalesce missed checkpoints into the latest matured one. Never fabricate
    -- an earlier snapshot by duplicating a value collected later.
    update private.threads_insight_jobs j set state='skipped' where j.workspace_id=p_workspace_id and j.state='pending'
      and exists(select 1 from private.threads_insight_jobs newer where newer.draft_id=j.draft_id and newer.after_hours>j.after_hours and newer.due_at<=clock_timestamp());
    select j.* into job from private.threads_insight_jobs j join public.drafts d on d.id=j.draft_id
      where j.workspace_id=p_workspace_id and j.account_id=a.id and d.publication_status='published'
      and j.due_at<=clock_timestamp() and j.next_attempt_at<=clock_timestamp() and j.attempts<3
      and (j.state='pending' or (j.state='collecting' and j.lease_until<clock_timestamp()))
      order by d.published_at desc,j.after_hours desc limit 1 for update of j skip locked;
    if found then
      update private.threads_insight_jobs set state='collecting',lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1
        where id=job.id returning * into job;
      select jsonb_build_object('id',job.id,'draftId',job.draft_id,'accountId',job.account_id,'afterHours',job.after_hours,
        'postId',d.threads_post_id) into v from public.drafts d where d.id=job.draft_id;
    end if;
    yesterday:=(clock_timestamp() at time zone 'Asia/Seoul')::date-1;
    return jsonb_build_object('post',v,'account',case when not exists(select 1 from public.account_insight_snapshots s where s.account_id=a.id and s.date=yesterday)
      then jsonb_build_object('id',a.id,'userId',a.threads_user_id,'date',yesterday) else null end);
  elsif p_operation in ('complete','failed') then
    select * into job from private.threads_insight_jobs j where j.id=(p_data->>'jobId')::uuid and j.workspace_id=p_workspace_id for update;
    if not found or job.state<>'collecting' or job.lease_until<clock_timestamp() then raise exception 'Insight lease expired' using errcode='55000'; end if;
    if p_operation='failed' then
      update private.threads_insight_jobs set state=case when job.attempts>=3 or p_data->>'transient'<>'true' then 'unavailable' else 'pending' end,
        next_attempt_at=clock_timestamp()+interval '1 hour',lease_until=null where id=job.id;return '{}'::jsonb;
    end if;
    for metric in select unnest(array['views','likes','replies','reposts','quotes','shares']) loop
      if p_data->'metrics'->metric <> 'null'::jsonb and (jsonb_typeof(p_data->'metrics'->metric)<>'number'
        or (p_data->'metrics'->>metric)::numeric<0 or (p_data->'metrics'->>metric)::numeric<>trunc((p_data->'metrics'->>metric)::numeric)) then
        raise exception 'Invalid metric' using errcode='22023'; end if;
    end loop;
    insert into public.threads_post_insight_snapshots(workspace_id,draft_id,account_id,after_hours,views,likes,replies,reposts,quotes,shares,unavailable)
      values(p_workspace_id,job.draft_id,job.account_id,job.after_hours,(p_data->'metrics'->>'views')::bigint,(p_data->'metrics'->>'likes')::bigint,
        (p_data->'metrics'->>'replies')::bigint,(p_data->'metrics'->>'reposts')::bigint,(p_data->'metrics'->>'quotes')::bigint,(p_data->'metrics'->>'shares')::bigint,coalesce(p_data->'unavailable','{}'))
      on conflict(draft_id,after_hours) do nothing;
    update private.threads_insight_jobs set state='completed',lease_until=null where id=job.id;
    update private.threads_insight_jobs set state='skipped' where draft_id=job.draft_id and after_hours<job.after_hours and state='pending';
  elsif p_operation='account' then
    yesterday:=(p_data->>'date')::date;
    if a.id is null or yesterday<>((clock_timestamp() at time zone 'Asia/Seoul')::date-1) then raise exception 'Invalid account snapshot' using errcode='22023'; end if;
    insert into public.account_insight_snapshots(workspace_id,account_id,date,followers_count,views,likes,replies,reposts,quotes,unavailable)
      values(p_workspace_id,a.id,yesterday,(p_data->'metrics'->>'followers_count')::bigint,(p_data->'metrics'->>'views')::bigint,(p_data->'metrics'->>'likes')::bigint,
        (p_data->'metrics'->>'replies')::bigint,(p_data->'metrics'->>'reposts')::bigint,(p_data->'metrics'->>'quotes')::bigint,coalesce(p_data->'unavailable','{}'))
      on conflict(account_id,date) do nothing;
  else raise exception 'Invalid operation' using errcode='22023'; end if;
  return '{}'::jsonb;
end $$;
revoke all on function private.threads_insight_operation(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.threads_insight_operation(uuid,text,text,jsonb) to anon,authenticated;
create function public.threads_insight_operation(p_workspace_id uuid,p_secret text,p_operation text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$ select private.threads_insight_operation(p_workspace_id,p_secret,p_operation,p_data); $$;
revoke all on function public.threads_insight_operation(uuid,text,text,jsonb) from public;
grant execute on function public.threads_insight_operation(uuid,text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
