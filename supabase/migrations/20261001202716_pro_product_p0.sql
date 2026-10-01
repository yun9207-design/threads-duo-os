begin;
alter table public.threads_accounts
  add column last_checked_at timestamptz default now(),
  add column token_status text not null default 'valid' check(token_status in ('valid','invalid','unknown')),
  add constraint threads_accounts_id_workspace_unique unique(id,workspace_id);
create function private.product_account_checked()
returns trigger language plpgsql security invoker set search_path='' as $$
begin new.last_checked_at:=new.connected_at; new.token_status:='valid'; return new; end $$;
revoke all on function private.product_account_checked() from public,anon,authenticated;
create trigger threads_account_checked before update of connected_at on public.threads_accounts
  for each row execute function private.product_account_checked();
alter table public.drafts
  add column auto_publish boolean not null default false,
  add column selected_threads_account_id uuid,
  add column history_hidden_at timestamptz,
  add constraint drafts_selected_account_workspace_fk foreign key(selected_threads_account_id,workspace_id)
    references public.threads_accounts(id,workspace_id) on delete restrict;
grant insert(scheduled_at,auto_publish,selected_threads_account_id) on public.drafts to authenticated;
grant update(auto_publish,selected_threads_account_id,history_hidden_at) on public.drafts to authenticated;
create index drafts_auto_due_idx on public.drafts(workspace_id,scheduled_at,id)
  where deleted_at is null and auto_publish and publication_status='unpublished';

-- Extend the existing claim to immediate approved posts; do not rebuild the engine.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('private.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb)'::regprocedure);
  if strpos(definition,'or draft.status <> ''approved'' or draft.scheduled_at is null')=0 then
    raise exception 'Existing engine contract changed';
  end if;
  execute replace(definition,'or draft.status <> ''approved'' or draft.scheduled_at is null',
    'or draft.status <> ''approved''');
end $$;

create function private.prepare_product_draft()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and (old.publication_status in ('publishing','published') or not old.publish_retryable)
    and (new.auto_publish is distinct from old.auto_publish
      or new.selected_threads_account_id is distinct from old.selected_threads_account_id) then
    raise exception 'Publication is locked' using errcode='55000';
  end if;
  if new.status<>'approved' or new.scheduled_at is null or new.deleted_at is not null then new.auto_publish:=false; end if;
  return new;
end $$;
revoke all on function private.prepare_product_draft() from public,anon,authenticated;
create trigger drafts_product_fields before insert or update on public.drafts
  for each row execute function private.prepare_product_draft();

create function public.save_product_post(p_workspace_id uuid,p_body text,p_mode text,
  p_draft_id uuid default null,p_expected_updated_at timestamptz default null,
  p_scheduled_at timestamptz default null,p_account_id uuid default null,p_allow_duplicate boolean default false)
returns setof public.drafts language plpgsql security invoker set search_path='' as $$
declare current_row public.drafts; begin
  if p_mode is null or p_body is null or p_mode not in ('draft','now','schedule') or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception 'Invalid post' using errcode='22023'; end if;
  if p_mode='schedule' and (p_scheduled_at is null or p_scheduled_at<=clock_timestamp() or not isfinite(p_scheduled_at)) then
    raise exception 'Future schedule required' using errcode='22023'; end if;
  -- Serialize duplicate checks within a workspace, including batch insert requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,0));
  if not coalesce(p_allow_duplicate,false) and exists(select 1 from public.drafts d where d.workspace_id=p_workspace_id
    and d.deleted_at is null and d.id is distinct from p_draft_id
    and lower(regexp_replace(btrim(d.body),'\s+',' ','g'))=lower(regexp_replace(btrim(p_body),'\s+',' ','g'))) then
    raise exception 'Duplicate post' using errcode='23505'; end if;
  if p_draft_id is not null then
    select * into current_row from public.drafts d where d.workspace_id=p_workspace_id and d.id=p_draft_id
      and d.deleted_at is null and d.updated_at=p_expected_updated_at for update;
    if not found then raise exception 'Post changed' using errcode='55000'; end if;
    if current_row.publication_status in ('publishing','published') or not current_row.publish_retryable then
      raise exception 'Post locked' using errcode='55000'; end if;
    return query update public.drafts d set topic=left(btrim(p_body),80),body=p_body,
      status=case when p_mode='draft' then 'draft' else 'approved' end,
      scheduled_at=case when p_mode='schedule' then p_scheduled_at else null end,
      auto_publish=(p_mode='schedule'),selected_threads_account_id=p_account_id
      where d.id=current_row.id returning d.*;
  else
    return query insert into public.drafts(workspace_id,author_profile_id,topic,body,status,scheduled_at,auto_publish,selected_threads_account_id)
      values(p_workspace_id,auth.uid(),left(btrim(p_body),80),p_body,
      case when p_mode='draft' then 'draft' else 'approved' end,
      case when p_mode='schedule' then p_scheduled_at else null end,p_mode='schedule',p_account_id) returning *;
  end if;
end $$;
revoke all on function public.save_product_post(uuid,text,text,uuid,timestamptz,timestamptz,uuid,boolean) from public,anon;
grant execute on function public.save_product_post(uuid,text,text,uuid,timestamptz,timestamptz,uuid,boolean) to authenticated;

create function public.save_product_batch(p_workspace_id uuid,p_posts jsonb)
returns setof public.drafts language plpgsql security invoker set search_path='' as $$
declare item jsonb; begin
  if jsonb_typeof(p_posts)<>'array' or jsonb_array_length(p_posts) not between 1 and 30 then
    raise exception 'Invalid batch' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_posts) loop
    if item->>'mode' is null or item->>'mode' not in ('draft','schedule') then
      raise exception 'Batch mode must be draft or schedule' using errcode='22023'; end if;
    return query select * from public.save_product_post(p_workspace_id,item->>'body',item->>'mode',
      p_scheduled_at=>nullif(item->>'scheduledAt','')::timestamptz,
      p_account_id=>nullif(item->>'accountId','')::uuid,p_allow_duplicate=>coalesce((item->>'allowDuplicate')::boolean,false));
  end loop;
end $$;
revoke all on function public.save_product_batch(uuid,jsonb) from public,anon;
grant execute on function public.save_product_batch(uuid,jsonb) to authenticated;

create table public.queue_worker_status(
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  last_run_at timestamptz, status text not null default 'waiting',detail text
);
alter table public.queue_worker_status enable row level security;
revoke all on public.queue_worker_status from public,anon,authenticated;
grant select on public.queue_worker_status to authenticated;
create policy queue_worker_member_read on public.queue_worker_status for select to authenticated
  using(workspace_id in(select private.current_workspace_ids()));

-- A separate bearer capability permits ONLY the scheduled worker's narrow operations.
-- It cannot log in, change members, connect accounts, or retrieve arbitrary drafts.
create function private.product_worker_operation(p_workspace_id uuid,p_secret text,p_operation text,
  p_draft_id uuid default null,p_attempt_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.drafts; actor uuid; result jsonb; previous_subject text; begin
  if not exists(select 1 from private.threads_publishing_config c where c.workspace_id=p_workspace_id
    and c.secret_digest=sha256(convert_to(p_secret,'UTF8')) and char_length(p_secret)>=43) then
    raise exception 'Invalid worker capability' using errcode='42501'; end if;
  if p_operation='heartbeat' then
    insert into public.queue_worker_status values(p_workspace_id,clock_timestamp(),left(p_data->>'status',30),left(p_data->>'detail',200))
      on conflict(workspace_id) do update set last_run_at=excluded.last_run_at,status=excluded.status,detail=excluded.detail;
    return '{}'::jsonb;
  end if;
  select m.profile_id into actor from public.workspace_members m where m.workspace_id=p_workspace_id
    and m.role='owner' order by m.joined_at limit 1;
  if actor is null then raise exception 'Workspace owner missing' using errcode='42501'; end if;
  previous_subject:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if p_operation='claim_due' then
    if not exists(select 1 from public.threads_accounts where workspace_id=p_workspace_id) then
      perform set_config('request.jwt.claim.sub',coalesce(previous_subject,''),true); return 'null'::jsonb; end if;
    select * into d from public.drafts where workspace_id=p_workspace_id and deleted_at is null
      and auto_publish and status='approved' and scheduled_at<=clock_timestamp()
      and publication_status='unpublished' and publish_retryable
      order by scheduled_at,id limit 1 for update skip locked;
    if not found then
      perform set_config('request.jwt.claim.sub',coalesce(previous_subject,''),true); return 'null'::jsonb; end if;
    result:=private.threads_publish_operation(p_workspace_id,p_secret,'claim',d.id,d.updated_at);
    result:=result || jsonb_build_object('account_user_id',
      (select threads_user_id from public.threads_accounts where workspace_id=p_workspace_id));
  elsif p_operation in ('container','published','failed') then
    if not exists(select 1 from public.drafts where id=p_draft_id and workspace_id=p_workspace_id
      and auto_publish and publish_attempt_id=p_attempt_id) then
      raise exception 'Worker attempt not found' using errcode='42501'; end if;
    result:=private.threads_publish_operation(p_workspace_id,p_secret,p_operation,p_draft_id,
      p_attempt_id=>p_attempt_id,p_data=>p_data);
  else raise exception 'Invalid worker operation' using errcode='22023'; end if;
  perform set_config('request.jwt.claim.sub',coalesce(previous_subject,''),true);
  return result;
end $$;
revoke all on function private.product_worker_operation(uuid,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant usage on schema private to anon;
grant execute on function private.product_worker_operation(uuid,text,text,uuid,uuid,jsonb) to anon,authenticated;
create function public.product_worker_operation(p_workspace_id uuid,p_secret text,p_operation text,
  p_draft_id uuid default null,p_attempt_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.product_worker_operation(p_workspace_id,p_secret,p_operation,p_draft_id,p_attempt_id,p_data);
$$;
revoke all on function public.product_worker_operation(uuid,text,text,uuid,uuid,jsonb) from public;
grant execute on function public.product_worker_operation(uuid,text,text,uuid,uuid,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
