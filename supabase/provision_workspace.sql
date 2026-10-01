-- Administrator-only template. Replace the two UUIDs with Authentication > Users
-- IDs of existing, confirmed test accounts. Do not add keys or passwords here.
-- No client-facing create/invite/role-change RPC is provided in this stage.
begin;

do $$
declare
  user_a uuid := '00000000-0000-0000-0000-00000000000a';
  user_b uuid := '00000000-0000-0000-0000-00000000000b';
  new_workspace uuid;
begin
  if user_a = user_b or (
    select count(*) from auth.users
    where id in (user_a, user_b) and email_confirmed_at is not null
  ) <> 2 then
    raise exception 'Supply two distinct, confirmed Auth user IDs before provisioning';
  end if;

  insert into public.profiles (id, display_name)
    values (user_a, 'User A'), (user_b, 'User B')
    on conflict (id) do nothing;

  insert into public.workspaces (name, created_by)
    values ('Duo Workspace', user_a) returning id into new_workspace;

  insert into public.workspace_members (workspace_id, profile_id, role)
    values (new_workspace, user_a, 'owner'), (new_workspace, user_b, 'member');

  if (select count(*) from public.workspace_members
      where workspace_id = new_workspace) <> 2 then
    raise exception 'The Duo workspace must start with exactly two members';
  end if;
end
$$;

commit;
