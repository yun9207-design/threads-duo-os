-- Apply once after workspace migration 001. Does not alter Auth or memberships.
begin;

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  author_profile_id uuid not null references public.profiles (id) on delete restrict,
  topic text not null check (char_length(btrim(topic)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 5000),
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index drafts_workspace_created_idx on public.drafts (workspace_id, created_at desc, id desc)
  where deleted_at is null;
create index drafts_author_idx on public.drafts (author_profile_id);
alter table public.drafts enable row level security;
revoke all on table public.drafts from public, anon, authenticated;
grant select on table public.drafts to authenticated;
grant insert (workspace_id, author_profile_id, topic, body, status) on public.drafts to authenticated;
grant update (topic, body, status, deleted_at) on public.drafts to authenticated;
-- No client DELETE privilege: deletion is recoverable via deleted_at.

create policy drafts_read_workspace_member on public.drafts for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));
create policy drafts_create_workspace_member on public.drafts for insert to authenticated
  with check (author_profile_id = (select auth.uid())
    and workspace_id in (select private.current_workspace_ids()));
create policy drafts_update_workspace_member on public.drafts for update to authenticated
  using (workspace_id in (select private.current_workspace_ids()))
  with check (workspace_id in (select private.current_workspace_ids()));

-- Defence against accidental future broad UPDATE grants. No elevated privileges.
create function private.prepare_draft_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.author_profile_id is distinct from old.author_profile_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Draft identity is immutable' using errcode = '23514';
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
revoke all on function private.prepare_draft_update() from public, anon, authenticated;
create trigger drafts_prepare_update before update on public.drafts
  for each row execute function private.prepare_draft_update();

comment on table public.drafts is 'Workspace text drafts. Owner/member CRUD, three stored statuses, soft deletion. No approval audit, scheduling, or publishing.';
notify pgrst, 'reload schema';
commit;
