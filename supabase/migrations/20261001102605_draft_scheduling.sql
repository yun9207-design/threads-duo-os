begin;

alter table public.drafts add column scheduled_at timestamptz;
alter table public.drafts add constraint drafts_schedule_approved_active
  check (scheduled_at is null or (status = 'approved' and deleted_at is null));
grant update (scheduled_at) on public.drafts to authenticated;
create index drafts_workspace_schedule_idx on public.drafts (workspace_id, scheduled_at, id)
  where deleted_at is null and scheduled_at is not null;

-- Existing membership RLS, immutable identity and updated_at trigger remain intact.
-- Validate new times at the database boundary, including direct Data API updates.
create function private.validate_draft_schedule()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at then
    if new.scheduled_at is not null and (
      new.status <> 'approved' or new.deleted_at is not null
      or not pg_catalog.isfinite(new.scheduled_at)
      or new.scheduled_at <= pg_catalog.clock_timestamp()
    ) then
      raise exception 'Only active approved drafts can receive a future schedule' using errcode = '22023';
    end if;
  end if;
  -- Reverting approval or soft-deleting a post invalidates its saved schedule.
  -- Elapsed times remain stored; this phase has no publishing executor.
  if new.status <> 'approved' or new.deleted_at is not null then
    new.scheduled_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_draft_schedule() from public, anon, authenticated;
create trigger drafts_validate_schedule before insert or update of scheduled_at, status, deleted_at
  on public.drafts for each row execute function private.validate_draft_schedule();
comment on column public.drafts.scheduled_at is
  'Planned publish instant for an active approved draft. NULL cancels. No publishing execution.';
notify pgrst, 'reload schema';
commit;
