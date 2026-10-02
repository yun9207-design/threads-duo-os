begin;
alter table public.drafts
  add column publish_stage text not null default 'queued'
    check(publish_stage in ('queued','processing','container_created','publishing','published','failed','test_completed')),
  add column publish_mode text check(publish_mode in ('TEST','LIVE')),
  add column publish_requested_at timestamptz,
  add column publish_error_code text,
  add column publish_retry_count integer not null default 0 check(publish_retry_count>=0),
  add column publish_next_retry_at timestamptz,
  add column publish_needs_attention boolean not null default false,
  add column tested_at timestamptz;
update public.drafts set publish_stage=case publication_status when 'published' then 'published' when 'failed' then 'failed'
  when 'publishing' then 'processing' else 'queued' end,
  publish_mode=case when publication_status='published' then 'LIVE' else null end,
  publish_requested_at=publish_started_at;
create index drafts_retry_due on public.drafts(workspace_id,publish_next_retry_at) where publication_status='failed' and not publish_needs_attention;

-- Wrap the original engine rather than replacing its claim, result and
-- idempotency implementation. Public callers and the existing worker keep the
-- same signature; only server-confirmed stage metadata is added.
alter function private.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb) rename to threads_publish_operation_base;
revoke all on function private.threads_publish_operation_base(uuid,text,text,uuid,timestamptz,uuid,jsonb) from public,anon,authenticated;
create function private.threads_publish_operation(p_workspace_id uuid,p_secret text,p_operation text,p_draft_id uuid default null,
  p_expected_updated_at timestamptz default null,p_attempt_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.drafts; a public.threads_accounts; result jsonb; old_retry integer; begin
  if auth.uid() is null or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.profile_id=auth.uid())
    or not exists(select 1 from private.threads_publishing_config c where c.workspace_id=p_workspace_id
      and char_length(p_secret)>=43 and c.secret_digest=sha256(convert_to(p_secret,'UTF8'))) then
    raise exception 'Publishing capability required' using errcode='42501'; end if;
  if p_operation='connect' then return private.threads_publish_operation_base(p_workspace_id,p_secret,p_operation,p_draft_id,p_expected_updated_at,p_attempt_id,p_data); end if;
  select * into d from public.drafts where workspace_id=p_workspace_id and id=p_draft_id and deleted_at is null for update;
  if not found then raise exception 'Draft not found' using errcode='P0002'; end if;
  if p_operation='claim' then
    select * into a from public.threads_accounts where workspace_id=p_workspace_id for update;
    if not found or a.connection_status not in ('connected','expiring','permission_required')
      or not a.granted_permissions @> array['threads_basic','threads_content_publish']
      or a.token_expires_at is null or a.token_expires_at<=clock_timestamp()
      or (d.selected_threads_account_id is not null and d.selected_threads_account_id<>a.id) then
      raise exception 'Publishing account unavailable' using errcode='55000'; end if;
    old_retry:=case when d.publication_status='failed' then d.publish_retry_count+1 else 0 end;
    result:=private.threads_publish_operation_base(p_workspace_id,p_secret,'claim',p_draft_id,p_expected_updated_at,p_attempt_id,p_data);
    update public.drafts set publish_stage='processing',publish_mode=a.publishing_mode,publish_requested_at=clock_timestamp(),
      publish_retry_count=old_retry,publish_next_retry_at=null,publish_needs_attention=false,publish_error_code=null
      where id=d.id returning * into d;
    return to_jsonb(d);
  end if;
  if d.publish_attempt_id is distinct from p_attempt_id then raise exception 'Attempt mismatch' using errcode='55000'; end if;
  if p_operation='published' and d.publication_status='published' and d.threads_post_id=p_data->>'post_id' then return to_jsonb(d); end if;
  if d.publication_status<>'publishing' then raise exception 'Attempt no longer active' using errcode='55000'; end if;
  if p_operation='publishing' then
    if d.publish_mode<>'LIVE' or not exists(select 1 from public.threads_accounts destination where destination.id=d.threads_account_id
      and destination.publishing_mode='LIVE' and destination.connection_status in ('connected','expiring','permission_required')) then
      raise exception 'Live publishing disabled' using errcode='55000'; end if;
    update public.drafts set publish_stage='publishing' where id=d.id returning * into d;
    return to_jsonb(d);
  elsif p_operation='test_completed' then
    if d.publish_mode<>'TEST' or d.threads_container_id is null then raise exception 'Not a test attempt' using errcode='55000'; end if;
    -- A successful TEST is not a published post. Keep it out of repeated worker
    -- execution until the user edits/reschedules it or explicitly posts again.
    update public.drafts set publication_status='unpublished',publish_stage='test_completed',tested_at=clock_timestamp(),
      publish_retryable=true,publish_error=null,publish_next_retry_at=null where id=d.id returning * into d;
    return to_jsonb(d);
  elsif p_operation='published' and (d.publish_mode<>'LIVE' or d.publish_stage<>'publishing') then
    raise exception 'Live publish stage required' using errcode='55000';
  end if;
  result:=private.threads_publish_operation_base(p_workspace_id,p_secret,p_operation,p_draft_id,p_expected_updated_at,p_attempt_id,p_data);
  select * into d from public.drafts where id=p_draft_id;
  if p_operation='container' then
    update public.drafts set publish_stage='container_created' where id=d.id returning * into d;
  elsif p_operation='published' then
    update public.drafts set publish_stage='published',publish_next_retry_at=null,publish_needs_attention=false where id=d.id returning * into d;
  elsif p_operation='failed' then
    update public.drafts set publish_stage='failed',publish_error_code=left(p_data->>'code',40),
      publish_needs_attention=not coalesce(d.publish_retryable and p_data->>'transient'='true' and d.publish_retry_count<3,false),
      publish_next_retry_at=case when d.publish_retryable and p_data->>'transient'='true' and d.publish_retry_count<3
        then clock_timestamp()+case d.publish_retry_count when 0 then interval '1 minute' when 1 then interval '5 minutes' else interval '15 minutes' end end
      where id=d.id returning * into d;
  end if;
  return to_jsonb(d);
end $$;
revoke all on function private.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb) to authenticated;

-- Preserve due-only claims, SKIP LOCKED, original worker capability and result
-- ownership. Extend its existing selector to bounded retries and exclude TEST
-- results even if the account is subsequently switched to LIVE.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('private.product_worker_operation(uuid,text,text,uuid,uuid,jsonb)'::regprocedure);
  if strpos(definition,'publication_status=''unpublished'' and publish_retryable')=0 then raise exception 'Worker selector changed'; end if;
  definition:=replace(definition,'publication_status=''unpublished'' and publish_retryable',
    'publish_retryable and publish_stage<>''test_completed'' and (publication_status=''unpublished'' or (publication_status=''failed'' and not publish_needs_attention and publish_next_retry_at<=clock_timestamp()))');
  definition:=replace(definition,'order by scheduled_at,id limit 1', 'order by coalesce(publish_next_retry_at,scheduled_at),id limit 1');
  definition:=replace(definition,'(''container'',''published'',''failed'')','(''container'',''publishing'',''published'',''failed'',''test_completed'')');
  execute definition;
end $$;

create function private.reset_product_pipeline()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (old.body is distinct from new.body or old.scheduled_at is distinct from new.scheduled_at or old.status is distinct from new.status
    or old.selected_threads_account_id is distinct from new.selected_threads_account_id)
    and old.publication_status not in ('published','publishing') and old.publish_retryable then
    new.publish_stage:='queued'; new.publish_next_retry_at:=null; new.publish_needs_attention:=false; new.publish_retry_count:=0;
  end if;
  return new;
end $$;
revoke all on function private.reset_product_pipeline() from public,anon,authenticated;
create trigger drafts_reset_product_pipeline before update on public.drafts for each row execute function private.reset_product_pipeline();
notify pgrst,'reload schema';
commit;
