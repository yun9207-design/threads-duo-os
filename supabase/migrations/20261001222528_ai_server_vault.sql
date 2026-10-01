-- Vault is provisioned by the operator; no credential values belong in migrations.
-- Only a confirmed workspace member AND the existing server capability can read
-- that workspace's AI key. The application never returns this RPC result to UI.
create function private.ai_server_credential(p_workspace_id uuid,p_server_secret text)
returns text language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); credential text;
begin
  if actor is null or not exists (
    select 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null
  ) or not exists (
    select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.profile_id=actor
  ) or not exists (
    select 1 from private.threads_publishing_config c where c.workspace_id=p_workspace_id
      and char_length(p_server_secret)>=43
      and c.secret_digest=pg_catalog.sha256(pg_catalog.convert_to(p_server_secret,'UTF8'))
  ) then
    raise exception 'AI server credential is not available' using errcode='42501';
  end if;
  select v.decrypted_secret into credential from vault.decrypted_secrets v
    where v.name='threads_pro_ai_'||p_workspace_id::text;
  return credential;
end;
$$;
revoke all on function private.ai_server_credential(uuid,text) from public,anon,authenticated;
grant execute on function private.ai_server_credential(uuid,text) to authenticated;

create function public.ai_server_credential(p_workspace_id uuid,p_server_secret text)
returns text language sql security invoker set search_path = '' as $$
  select private.ai_server_credential(p_workspace_id,p_server_secret);
$$;
revoke all on function public.ai_server_credential(uuid,text) from public,anon,authenticated;
grant execute on function public.ai_server_credential(uuid,text) to authenticated;
