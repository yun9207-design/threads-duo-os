begin;

-- Metadata only. Threads tokens never enter the Data API or a public table.
create table public.threads_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  threads_user_id text not null check (threads_user_id ~ '^[0-9]+$'),
  username text not null check (char_length(username) between 1 and 100),
  connected_by uuid not null references public.profiles(id) on delete restrict,
  connected_at timestamptz not null default now()
);
create index threads_accounts_connected_by_idx on public.threads_accounts(connected_by);
alter table public.threads_accounts enable row level security;
revoke all on public.threads_accounts from public, anon, authenticated;
grant select on public.threads_accounts to authenticated;
create policy threads_accounts_member_read on public.threads_accounts for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

-- An operator provisions the hash of a random server-only signing secret.
-- No service-role key is needed by the web application.
create table private.threads_publishing_config (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  secret_digest bytea not null check (octet_length(secret_digest) = 32)
);
alter table private.threads_publishing_config enable row level security;
revoke all on private.threads_publishing_config from public, anon, authenticated;

-- Review status stays draft/pending/approved; publication is an independent state.
alter table public.drafts
  add column publication_status text not null default 'unpublished'
    check (publication_status in ('unpublished','publishing','published','failed')),
  add column threads_account_id uuid references public.threads_accounts(id) on delete restrict,
  add column threads_container_id text,
  add column threads_post_id text,
  add column published_at timestamptz,
  add column publish_error text check (char_length(publish_error) <= 1000),
  add column publish_attempt_id uuid,
  add column publish_started_at timestamptz,
  add column publish_retryable boolean not null default true;
alter table public.drafts add constraint drafts_published_result_required check (
  publication_status <> 'published' or (threads_post_id is not null and published_at is not null)
);
create index drafts_threads_account_idx on public.drafts(threads_account_id);
create index drafts_workspace_publication_idx on public.drafts(workspace_id, publication_status)
  where deleted_at is null;
-- Existing authenticated column grants intentionally do not include new fields.

create function private.lock_publishing_draft()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (old.publication_status in ('publishing','published') or not old.publish_retryable) and (
    new.topic is distinct from old.topic or new.body is distinct from old.body
    or new.status is distinct from old.status or new.scheduled_at is distinct from old.scheduled_at
    or new.deleted_at is distinct from old.deleted_at
  ) then
    raise exception 'Publishing content is locked' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_publishing_draft() from public, anon, authenticated;
create trigger drafts_lock_publishing before update on public.drafts
  for each row execute function private.lock_publishing_draft();

-- The private definer has one narrow purpose: persist server-confirmed results.
-- Membership AND the server secret are required, including for every completion.
create function private.threads_publish_operation(
  p_workspace_id uuid, p_secret text, p_operation text, p_draft_id uuid default null,
  p_expected_updated_at timestamptz default null, p_attempt_id uuid default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  account public.threads_accounts;
  draft public.drafts;
begin
  if actor is null or not exists (
    select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.profile_id = actor
  ) or not exists (
    select 1 from private.threads_publishing_config c where c.workspace_id = p_workspace_id
      and c.secret_digest = pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8'))
      and char_length(p_secret) >= 43
  ) then
    raise exception 'Publishing is not available' using errcode = '42501';
  end if;
  if p_operation = 'connect' then
    if not exists (select 1 from public.workspace_members m
      where m.workspace_id = p_workspace_id and m.profile_id = actor and m.role = 'owner') then
      raise exception 'Owner required' using errcode = '42501';
    end if;
    if coalesce(p_data->>'user_id','') !~ '^[0-9]+$'
      or coalesce(char_length(p_data->>'username'),0) not between 1 and 100 then
      raise exception 'Invalid account' using errcode = '22023';
    end if;
    select * into account from public.threads_accounts where workspace_id = p_workspace_id for update;
    -- Phase 1 deliberately cannot silently switch destinations for existing drafts.
    if found and account.threads_user_id <> p_data->>'user_id' then
      raise exception 'Account replacement requires operator review' using errcode = '55000';
    end if;
    insert into public.threads_accounts(workspace_id,threads_user_id,username,connected_by)
      values(p_workspace_id,p_data->>'user_id',p_data->>'username',actor)
      on conflict(workspace_id) do update set username = excluded.username,
        connected_by = excluded.connected_by, connected_at = pg_catalog.clock_timestamp()
      returning * into account;
    return pg_catalog.to_jsonb(account);
  end if;
  select * into draft from public.drafts d
    where d.workspace_id = p_workspace_id and d.id = p_draft_id and d.deleted_at is null for update;
  if not found then raise exception 'Draft not found' using errcode = 'P0002'; end if;
  if p_operation = 'claim' then
    if draft.updated_at is distinct from p_expected_updated_at
      or draft.status <> 'approved' or draft.scheduled_at is null
      or draft.publication_status not in ('unpublished','failed')
      or not draft.publish_retryable then
      raise exception 'Draft is not ready or already claimed' using errcode = '55000';
    end if;
    if char_length(pg_catalog.btrim(draft.body)) = 0 then
      raise exception 'Text is required' using errcode = '22023';
    end if;
    select * into account from public.threads_accounts where workspace_id = p_workspace_id;
    if not found then raise exception 'Account not connected' using errcode = '55000'; end if;
    update public.drafts d set publication_status = 'publishing', threads_account_id = account.id,
      threads_container_id = null, threads_post_id = null, published_at = null, publish_error = null,
      publish_attempt_id = gen_random_uuid(), publish_started_at = pg_catalog.clock_timestamp(),
      publish_retryable = false
      where d.id = draft.id returning * into draft;
    return pg_catalog.to_jsonb(draft);
  end if;
  if draft.publish_attempt_id is distinct from p_attempt_id then
    raise exception 'Attempt mismatch' using errcode = '55000';
  end if;
  -- Persisting the same successful response is idempotent; publishing the post is not retried.
  if p_operation = 'published' and draft.publication_status = 'published'
    and draft.threads_post_id = p_data->>'post_id' then return pg_catalog.to_jsonb(draft); end if;
  if draft.publication_status <> 'publishing' then
    raise exception 'Attempt is no longer active' using errcode = '55000';
  end if;
  if p_operation = 'container' then
    if coalesce(p_data->>'container_id','') !~ '^[0-9]+$' then
      raise exception 'Invalid container' using errcode = '22023';
    end if;
    if draft.threads_container_id is not null and draft.threads_container_id <> p_data->>'container_id' then
      raise exception 'Container mismatch' using errcode = '55000';
    end if;
    update public.drafts d set threads_container_id = p_data->>'container_id'
      where d.id = draft.id returning * into draft;
  elsif p_operation = 'published' then
    if draft.threads_container_id is null or coalesce(p_data->>'post_id','') !~ '^[0-9]+$' then
      raise exception 'Invalid published result' using errcode = '22023';
    end if;
    update public.drafts d set publication_status = 'published', threads_post_id = p_data->>'post_id',
      published_at = pg_catalog.clock_timestamp(), publish_error = null, publish_retryable = false
      where d.id = draft.id returning * into draft;
  elsif p_operation = 'failed' then
    update public.drafts d set publication_status = 'failed',
      publish_error = left(coalesce(p_data->>'error','Threads request failed'),1000),
      publish_retryable = coalesce((p_data->>'retryable')::boolean,false)
      where d.id = draft.id returning * into draft;
  else
    raise exception 'Invalid operation' using errcode = '22023';
  end if;
  return pg_catalog.to_jsonb(draft);
end;
$$;
revoke all on function private.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function private.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb) to authenticated;

create function public.threads_publish_operation(
  p_workspace_id uuid, p_secret text, p_operation text, p_draft_id uuid default null,
  p_expected_updated_at timestamptz default null, p_attempt_id uuid default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.threads_publish_operation(p_workspace_id,p_secret,p_operation,p_draft_id,
    p_expected_updated_at,p_attempt_id,p_data);
$$;
revoke all on function public.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb) to authenticated;
comment on table public.threads_accounts is 'Workspace Threads destination metadata; credentials are server environment variables only.';
comment on column public.drafts.publication_status is 'Independent of approval status. Manual publication only; no Cron.';
notify pgrst, 'reload schema';
commit;
