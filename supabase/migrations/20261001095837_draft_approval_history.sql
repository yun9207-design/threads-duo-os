begin;

create table public.draft_approval_history (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  from_status text not null check (from_status in ('draft', 'pending', 'approved')),
  to_status text not null check (to_status in ('draft', 'pending', 'approved')),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default clock_timestamp(),
  check (from_status <> to_status)
);
create index draft_approval_history_timeline_idx
  on public.draft_approval_history(draft_id, created_at, id);
create index draft_approval_history_workspace_idx on public.draft_approval_history(workspace_id);
create index draft_approval_history_actor_idx on public.draft_approval_history(actor_user_id);
alter table public.draft_approval_history enable row level security;
revoke all on public.draft_approval_history from public, anon, authenticated;
grant select on public.draft_approval_history to authenticated;
create policy draft_approval_history_read_member
  on public.draft_approval_history for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

-- Only a private trigger can append history; clients cannot forge or edit it.
-- Definer rights are confined to this insert and the caller's membership check.
create function private.record_draft_approval_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not exists (
    select 1 from public.workspace_members
    where workspace_id = new.workspace_id and profile_id = actor_id
  ) then
    raise exception 'A workspace member is required for status changes' using errcode = '42501';
  end if;
  insert into public.draft_approval_history
    (draft_id, workspace_id, actor_user_id, from_status, to_status, note)
  values (new.id, new.workspace_id, actor_id, old.status, new.status,
    nullif(pg_catalog.current_setting('threads_duo.approval_note', true), ''));
  return new;
end;
$$;
revoke all on function private.record_draft_approval_history() from public, anon, authenticated;
create trigger drafts_record_approval_history after update of status on public.drafts
  for each row when (old.status is distinct from new.status)
  execute function private.record_draft_approval_history();

-- The invoker retains existing drafts RLS/column grants and optimistic concurrency.
-- A transaction-local note is passed to the trigger, then the previous value restored.
create function public.update_draft_with_history(
  p_workspace_id uuid, p_draft_id uuid, p_expected_updated_at timestamptz,
  p_topic text, p_body text, p_status text, p_note text default null
)
returns setof public.drafts language plpgsql security invoker set search_path = '' as $$
declare
  current_status text;
  normalized_note text := nullif(pg_catalog.btrim(p_note), '');
  previous_note text := pg_catalog.current_setting('threads_duo.approval_note', true);
begin
  if char_length(normalized_note) > 1000 then
    raise exception 'Status note exceeds 1000 characters' using errcode = '22023';
  end if;
  select d.status into current_status from public.drafts d
    where d.id = p_draft_id and d.workspace_id = p_workspace_id
      and d.updated_at = p_expected_updated_at and d.deleted_at is null for update;
  if not found then return; end if;
  if normalized_note is not null and current_status = p_status then
    raise exception 'A note requires a status change' using errcode = '22023';
  end if;
  perform pg_catalog.set_config('threads_duo.approval_note', coalesce(normalized_note, ''), true);
  return query update public.drafts d set topic = p_topic, body = p_body, status = p_status
    where d.id = p_draft_id and d.workspace_id = p_workspace_id
      and d.updated_at = p_expected_updated_at and d.deleted_at is null returning d.*;
  perform pg_catalog.set_config('threads_duo.approval_note', coalesce(previous_note, ''), true);
end;
$$;
revoke all on function public.update_draft_with_history(uuid,uuid,timestamptz,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.update_draft_with_history(uuid,uuid,timestamptz,text,text,text,text)
  to authenticated;
comment on table public.draft_approval_history is
  'Append-only status changes recorded atomically by the drafts trigger. No fabricated historical backfill.';
notify pgrst, 'reload schema';
commit;
