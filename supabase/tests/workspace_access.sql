-- Run in the SQL Editor as postgres AFTER provisioning actual confirmed users.
-- Replace the five UUID placeholders. This verifies database roles/RLS, not login.
-- Changes made by the revocation test are rolled back; existing data is retained.
begin;
select set_config('test.user_a', '00000000-0000-0000-0000-00000000000a', true);
select set_config('test.user_b', '00000000-0000-0000-0000-00000000000b', true);
select set_config('test.shared', '10000000-0000-0000-0000-000000000001', true);
select set_config('test.only_a', '10000000-0000-0000-0000-000000000002', true);
select set_config('test.only_b', '10000000-0000-0000-0000-000000000003', true);

do $$
declare t text;
begin
  if (select count(*) from auth.users
      where id in (current_setting('test.user_a')::uuid, current_setting('test.user_b')::uuid)
      and email_confirmed_at is not null) <> 2 then
    raise exception 'Actual A/B users must exist and be confirmed';
  end if;
  if (select count(*) from public.workspaces
      where id in (current_setting('test.shared')::uuid, current_setting('test.only_a')::uuid, current_setting('test.only_b')::uuid)) <> 3 then
    raise exception 'All three existing workspace fixtures are required';
  end if;
  foreach t in array array['profiles', 'workspaces', 'workspace_members'] loop
    if not (select relrowsecurity from pg_class where oid=('public.' || t)::regclass)
      or not has_table_privilege('authenticated', 'public.' || t, 'SELECT')
      or has_table_privilege('anon', 'public.' || t, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || t, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'Invalid RLS/grants on %', t;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private'
        and p.proname in ('current_workspace_ids', 'can_read_profile')
        and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
        and array_to_string(p.proconfig, ',') like 'search_path=%') <> 2 then
    raise exception 'Invalid private helper ownership/security configuration';
  end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
set local role authenticated;
do $$
declare t text;
begin
  if auth.uid() <> current_setting('test.user_a')::uuid then raise exception 'Wrong A subject'; end if;
  if (select count(*) from public.workspaces where id=current_setting('test.shared')::uuid) <> 1
    or (select count(*) from public.workspace_members where workspace_id=current_setting('test.shared')::uuid) <> 2
    or (select role from public.workspace_members where workspace_id=current_setting('test.shared')::uuid and profile_id=auth.uid()) <> 'owner'
    or (select count(*) from public.workspaces where id=current_setting('test.only_a')::uuid) <> 1
    or (select count(*) from public.workspaces where id=current_setting('test.only_b')::uuid) <> 0
    or (select count(*) from public.workspace_members where workspace_id=current_setting('test.only_b')::uuid) <> 0
    or (select count(*) from public.profiles where id=current_setting('test.user_b')::uuid) <> 1 then
    raise exception 'A visibility is incorrect';
  end if;
  foreach t in array array['profiles', 'workspaces', 'workspace_members'] loop
    begin
      execute format('insert into public.%I default values', t);
      raise exception 'Unexpected insert permission on %', t;
    exception when insufficient_privilege then null;
    end;
    begin
      execute format('delete from public.%I', t);
      raise exception 'Unexpected delete permission on %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    update public.workspace_members set role='owner';
    raise exception 'Unexpected role escalation permission';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
set local role authenticated;
do $$
begin
  if auth.uid() <> current_setting('test.user_b')::uuid then raise exception 'Wrong B subject'; end if;
  if (select count(*) from public.workspaces where id=current_setting('test.shared')::uuid) <> 1
    or (select count(*) from public.workspace_members where workspace_id=current_setting('test.shared')::uuid) <> 2
    or (select role from public.workspace_members where workspace_id=current_setting('test.shared')::uuid and profile_id=auth.uid()) <> 'member'
    or (select count(*) from public.workspaces where id=current_setting('test.only_b')::uuid) <> 1
    or (select count(*) from public.workspaces where id=current_setting('test.only_a')::uuid) <> 0
    or (select count(*) from public.workspace_members where workspace_id=current_setting('test.only_a')::uuid) <> 0
    or (select count(*) from public.profiles where id=current_setting('test.user_a')::uuid) <> 1 then
    raise exception 'B visibility is incorrect';
  end if;
  begin
    update public.workspace_members set role='owner';
    raise exception 'Unexpected B role escalation permission';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.workspaces)
    or exists (select 1 from public.workspace_members)
    or exists (select 1 from public.profiles) then
    raise exception 'Missing authenticated subject must not grant access';
  end if;
end $$;
reset role;

set local role anon;
do $$
declare t text;
begin
  foreach t in array array['profiles', 'workspaces', 'workspace_members'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'Unexpected anonymous read permission on %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform private.current_workspace_ids();
    raise exception 'Unexpected anonymous helper permission';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A still-created workspace must not remain accessible after membership removal.
delete from public.workspace_members
  where workspace_id=current_setting('test.shared')::uuid
    and profile_id=current_setting('test.user_b')::uuid;
select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.workspaces where id=current_setting('test.shared')::uuid)
    or exists (select 1 from public.workspace_members where workspace_id=current_setting('test.shared')::uuid)
    or exists (select 1 from public.profiles where id=current_setting('test.user_a')::uuid) then
    raise exception 'Revoked membership still grants access';
  end if;
end $$;
reset role;
rollback;

select 'PASS: actual A/B IDs, shared workspace, foreign IDs, anonymous denial, write denial, membership revocation; all test changes rolled back' as result;
