-- Run as a trusted database administrator AFTER migration 002.
-- New Drafts CRUD/RLS only; no sign-ins or changes to Auth/workspace foundation.
-- Every test row is rolled back. This is not a browser/API session test.
begin;
do $$
declare
  duo uuid;
  owner_id uuid;
  member_id uuid;
  foreign_id uuid;
  draft_id uuid;
  old_version timestamptz;
  affected integer;
  denied boolean;
begin
  select w.id into strict duo from public.workspaces w where w.name = 'Duo Workspace';
  select m.profile_id into strict owner_id from public.workspace_members m where m.workspace_id = duo and m.role = 'owner';
  select m.profile_id into strict member_id from public.workspace_members m where m.workspace_id = duo and m.role = 'member';
  select w.id into foreign_id from public.workspaces w
    where not exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.profile_id = owner_id)
    order by w.created_at limit 1;
  if foreign_id is null then raise exception 'An existing inaccessible workspace fixture is required'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  insert into public.drafts(workspace_id,author_profile_id,topic,body,status)
    values(duo,owner_id,'Drafts SQL smoke','Owner saved body','draft') returning id,updated_at into draft_id,old_version;
  if not exists(select 1 from public.drafts where id=draft_id and body='Owner saved body') then
    raise exception 'Create/read failed';
  end if;
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  update public.drafts set body='Member saved body',status='pending' where id=draft_id and updated_at=old_version;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Shared member update failed'; end if;
  update public.drafts set body='Stale overwrite' where id=draft_id and updated_at=old_version;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Stale overwrite was accepted'; end if;
  update public.drafts set status='approved' where id=draft_id;
  if not exists(select 1 from public.drafts where id=draft_id and body='Member saved body' and status='approved' and author_profile_id=owner_id) then
    raise exception 'Status/author preservation failed';
  end if;
  denied := false;
  begin
    insert into public.drafts(workspace_id,author_profile_id,topic) values(duo,owner_id,'Forged author');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Author spoof was accepted'; end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  denied := false;
  begin
    insert into public.drafts(workspace_id,author_profile_id,topic) values(foreign_id,owner_id,'Foreign workspace');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Foreign insert was accepted'; end if;
  if exists(select 1 from public.drafts where workspace_id=foreign_id) then raise exception 'Foreign read leaked'; end if;
  update public.drafts set body='Foreign update' where workspace_id=foreign_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign update succeeded'; end if;
  update public.drafts set deleted_at=now() where id=draft_id;
  if exists(select 1 from public.drafts where id=draft_id and deleted_at is null) then raise exception 'Soft delete failed'; end if;
  denied := false;
  begin
    delete from public.drafts where id=draft_id;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Physical DELETE was accepted'; end if;
  execute 'reset role';
  execute 'set local role anon';
  denied := false;
  begin
    perform 1 from public.drafts limit 1;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous read was accepted'; end if;
  execute 'reset role';
end;
$$;
select 'PASS: Drafts create/read/member edit/status/version/delete/foreign/anonymous; rolled back' as result;
rollback;
