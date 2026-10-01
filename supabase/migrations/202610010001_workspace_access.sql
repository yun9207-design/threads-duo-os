-- Workspace access foundation only. Run as the project database administrator.
-- Atomic and deliberately fails if these objects already exist: inspect drift first.
begin;

create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);

create index workspace_members_profile_workspace_idx
  on public.workspace_members (profile_id, workspace_id);
-- A workspace can have at most one owner. Provisioning supplies its initial owner.
create unique index workspace_members_one_owner_idx
  on public.workspace_members (workspace_id) where role = 'owner';
create index workspaces_created_by_idx on public.workspaces (created_by);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Default Supabase grants vary by project. Explicitly remove write/anonymous grants.
revoke all on table public.profiles, public.workspaces, public.workspace_members
  from public, anon, authenticated;
grant select on table public.profiles, public.workspaces, public.workspace_members
  to authenticated;

-- Definer helpers avoid recursive membership policies. They derive the caller from
-- auth.uid(), expose no writable operation, and live outside Data API schemas.
create function private.current_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members as m
  where m.profile_id = (select auth.uid())
$$;

create function private.can_read_profile(target_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    target_profile_id = (select auth.uid())
    or exists (
      select 1
      from public.workspace_members as viewer
      join public.workspace_members as peer
        on peer.workspace_id = viewer.workspace_id
      where viewer.profile_id = (select auth.uid())
        and peer.profile_id = target_profile_id
    )
  )
$$;

alter function private.current_workspace_ids() owner to postgres;
alter function private.can_read_profile(uuid) owner to postgres;
revoke all on function private.current_workspace_ids(), private.can_read_profile(uuid)
  from public, anon, authenticated;
grant execute on function private.current_workspace_ids(), private.can_read_profile(uuid)
  to authenticated;

create policy profiles_read_self_or_workspace_peer
  on public.profiles for select to authenticated
  using (private.can_read_profile(id));

create policy workspaces_read_member
  on public.workspaces for select to authenticated
  using (id in (select private.current_workspace_ids()));

create policy workspace_members_read_workspace_member
  on public.workspace_members for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

comment on table public.profiles is 'Auth identity profile. No email, token, or workspace-wide role.';
comment on table public.workspace_members is 'Per-workspace owner/member roles. Client access is SELECT only in this stage.';

commit;
