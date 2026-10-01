begin;
create or replace function private.prepare_product_draft()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and (old.publication_status in ('publishing','published') or not old.publish_retryable)
    and (new.auto_publish is distinct from old.auto_publish
      or new.selected_threads_account_id is distinct from old.selected_threads_account_id) then
    raise exception 'Publication is locked' using errcode='55000';
  end if;
  -- Editing/cancelling/rescheduling a safely retryable failure is an explicit new intent.
  -- Hiding History alone never resets a result, and uncertain outcomes remain locked.
  if tg_op='UPDATE' and old.publication_status='failed' and old.publish_retryable
    and (new.body is distinct from old.body or new.status is distinct from old.status
      or new.scheduled_at is distinct from old.scheduled_at
      or new.selected_threads_account_id is distinct from old.selected_threads_account_id) then
    new.publication_status:='unpublished'; new.publish_error:=null;
  end if;
  if new.status<>'approved' or new.scheduled_at is null or new.deleted_at is not null then new.auto_publish:=false; end if;
  return new;
end $$;
revoke all on function private.prepare_product_draft() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
