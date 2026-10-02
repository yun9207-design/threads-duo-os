begin;
alter table public.threads_accounts
  add column connection_status text not null default 'disconnected'
    check(connection_status in ('connected','expiring','token_error','disconnected','permission_required')),
  add column publishing_mode text not null default 'TEST' check(publishing_mode in ('TEST','LIVE')),
  add column token_expires_at timestamptz,
  add column token_refreshed_at timestamptz,
  add column granted_permissions text[] not null default '{}',
  add column api_error_code text,
  add column api_message text,
  add column maintenance_after timestamptz not null default now();

-- Only authenticated metadata is exposed. AES-256-GCM ciphertext is sealed on the
-- server with a workspace-bound key; neither the encrypted envelope nor a token
-- is ever returned by application HTTP endpoints or page props.
create table private.threads_account_credentials(
  account_id uuid primary key references public.threads_accounts(id) on delete cascade,
  envelope text not null check(char_length(envelope) between 50 and 16000),
  issued_at timestamptz not null default now()
);
create table private.threads_oauth_states(
  state_hash text primary key check(state_hash ~ '^[a-f0-9]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table private.threads_account_credentials enable row level security;
alter table private.threads_oauth_states enable row level security;
revoke all on private.threads_account_credentials,private.threads_oauth_states from public,anon,authenticated;

create function private.threads_account_operation(p_workspace_id uuid,p_secret text,p_operation text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a public.threads_accounts; v jsonb; state_row private.threads_oauth_states;
begin
  if not exists(select 1 from private.threads_publishing_config c where c.workspace_id=p_workspace_id
    and char_length(p_secret)>=43 and c.secret_digest=sha256(convert_to(p_secret,'UTF8'))) then
    raise exception 'Server capability required' using errcode='42501'; end if;
  -- Worker maintenance has a separate, intentionally narrow allowlist. All other
  -- operations also require the real current user to be the workspace owner.
  if p_operation not in ('credential','health','refresh','maintenance_claim','maintenance_release') then
    if actor is null or not exists(select 1 from public.workspace_members m
      where m.workspace_id=p_workspace_id and m.profile_id=actor and m.role='owner') then
      raise exception 'Owner required' using errcode='42501'; end if;
  elsif actor is not null and not exists(select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id and m.profile_id=actor) then
    raise exception 'Membership required' using errcode='42501'; end if;
  if p_operation='state_create' then
    delete from private.threads_oauth_states where expires_at<clock_timestamp()
      or (actor_id=actor and workspace_id=p_workspace_id);
    insert into private.threads_oauth_states values(p_data->>'hash',p_workspace_id,actor,clock_timestamp()+interval '10 minutes',clock_timestamp());
    return '{}'::jsonb;
  elsif p_operation='state_consume' then
    delete from private.threads_oauth_states where state_hash=p_data->>'hash'
      and actor_id=actor and workspace_id=p_workspace_id and expires_at>clock_timestamp()
      returning * into state_row;
    if not found then raise exception 'Authorization expired' using errcode='55000'; end if;
    return '{}'::jsonb;
  end if;
  select * into a from public.threads_accounts where workspace_id=p_workspace_id for update;
  if p_operation='connect' then
    if coalesce(p_data->>'userId','')!~'^[0-9]+$' or coalesce(char_length(p_data->>'username'),0) not between 1 and 100
      or coalesce(char_length(p_data->>'envelope'),0) not between 50 and 16000
      or (p_data->>'expiresAt')::timestamptz<=clock_timestamp() then
      raise exception 'Invalid connection' using errcode='22023'; end if;
    -- Keep the existing destination stable. Reconnecting another identity must
    -- never silently redirect queued content to a different Threads profile.
    if a.id is not null and a.threads_user_id<>p_data->>'userId' then
      raise exception 'Destination mismatch' using errcode='55000'; end if;
    insert into public.threads_accounts(workspace_id,threads_user_id,username,connected_by)
      values(p_workspace_id,p_data->>'userId',p_data->>'username',actor)
      on conflict(workspace_id) do update set username=excluded.username,connected_by=actor,connected_at=clock_timestamp()
      returning * into a;
    insert into private.threads_account_credentials(account_id,envelope) values(a.id,p_data->>'envelope')
      on conflict(account_id) do update set envelope=excluded.envelope,issued_at=clock_timestamp();
    update public.threads_accounts set publishing_mode='TEST',token_status='valid',
      connection_status=case when (p_data->'permissions') @> '["threads_basic","threads_content_publish","threads_manage_insights"]'::jsonb
        then 'connected' else 'permission_required' end,
      granted_permissions=array(select jsonb_array_elements_text(p_data->'permissions')),
      token_expires_at=(p_data->>'expiresAt')::timestamptz,token_refreshed_at=clock_timestamp(),
      last_checked_at=clock_timestamp(),api_error_code=null,api_message=null,maintenance_after=clock_timestamp()+interval '1 day'
      where id=a.id returning * into a;
  elsif a.id is null then return 'null'::jsonb;
  elsif p_operation='credential' then
    if a.connection_status in ('disconnected','token_error') or a.token_expires_at<=clock_timestamp() then return 'null'::jsonb; end if;
    select jsonb_build_object('envelope',c.envelope,'account',to_jsonb(a),'issuedAt',c.issued_at)
      into v from private.threads_account_credentials c where c.account_id=a.id;
    return coalesce(v,'null'::jsonb);
  elsif p_operation='mode' then
    if p_data->>'mode' not in ('TEST','LIVE') then raise exception 'Invalid mode' using errcode='22023'; end if;
    if p_data->>'mode'='LIVE' and (a.connection_status not in ('connected','expiring')
      or not a.granted_permissions @> array['threads_basic','threads_content_publish']
      or a.token_expires_at is null or a.token_expires_at<=clock_timestamp() or (p_data->>'confirmation') is distinct from 'LIVE'
      or not exists(select 1 from private.threads_account_credentials c where c.account_id=a.id)) then
      raise exception 'Connection or confirmation required' using errcode='55000'; end if;
    update public.threads_accounts set publishing_mode=p_data->>'mode' where id=a.id returning * into a;
  elsif p_operation='disconnect' then
    delete from private.threads_account_credentials where account_id=a.id;
    update public.threads_accounts set publishing_mode='TEST',connection_status='disconnected',token_status='unknown',
      granted_permissions='{}',api_message=null,api_error_code=null where id=a.id returning * into a;
  elsif p_operation='health' then
    if p_data->>'status' not in ('connected','expiring','token_error','permission_required') then
      raise exception 'Invalid health' using errcode='22023'; end if;
    update public.threads_accounts set connection_status=p_data->>'status',
      token_status=case when p_data->>'status'='token_error' then 'invalid' else 'valid' end,
      last_checked_at=case when p_data->>'ok'='true' then clock_timestamp() else last_checked_at end,
      granted_permissions=case when p_data ? 'permissions' then array(select jsonb_array_elements_text(p_data->'permissions')) else granted_permissions end,
      api_error_code=left(p_data->>'code',40),api_message=left(p_data->>'message',200) where id=a.id returning * into a;
  elsif p_operation='refresh' then
    if coalesce(char_length(p_data->>'envelope'),0) not between 50 and 16000
      or (p_data->>'expiresAt')::timestamptz<=clock_timestamp() then raise exception 'Invalid refresh' using errcode='22023'; end if;
    update private.threads_account_credentials set envelope=p_data->>'envelope',issued_at=clock_timestamp() where account_id=a.id;
    if not found then raise exception 'Reconnect required' using errcode='55000'; end if;
    update public.threads_accounts set token_refreshed_at=clock_timestamp(),token_expires_at=(p_data->>'expiresAt')::timestamptz
      where id=a.id returning * into a;
  elsif p_operation='maintenance_claim' then
    if a.maintenance_after>clock_timestamp() or a.connection_status='disconnected' then return 'null'::jsonb; end if;
    update public.threads_accounts set maintenance_after=clock_timestamp()+interval '10 minutes' where id=a.id;
    return to_jsonb(a);
  elsif p_operation='maintenance_release' then
    update public.threads_accounts set maintenance_after=clock_timestamp()+case when p_data->>'ok'='true' then interval '1 day' else interval '1 hour' end
      where id=a.id returning * into a;
  else raise exception 'Invalid operation' using errcode='22023'; end if;
  return to_jsonb(a);
end $$;
revoke all on function private.threads_account_operation(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.threads_account_operation(uuid,text,text,jsonb) to anon,authenticated;
create function public.threads_account_operation(p_workspace_id uuid,p_secret text,p_operation text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
  select private.threads_account_operation(p_workspace_id,p_secret,p_operation,p_data);
$$;
revoke all on function public.threads_account_operation(uuid,text,text,jsonb) from public;
grant execute on function public.threads_account_operation(uuid,text,text,jsonb) to anon,authenticated;
comment on table public.threads_accounts is 'Public workspace-scoped metadata only. OAuth credentials are server-sealed in private storage.';
notify pgrst,'reload schema';
commit;
