begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Cron commands contain no bearer keys; read the dispatch capability from encrypted Vault.
create function private.dispatch_threads_queue()
returns void language plpgsql security invoker set search_path='' as $$
declare destination record; begin
  for destination in
    select c.workspace_id,v.decrypted_secret from private.threads_publishing_config c
    join vault.decrypted_secrets v on v.name='threads_pro_worker_'||c.workspace_id::text
    where c.secret_digest=sha256(convert_to(v.decrypted_secret,'UTF8'))
  loop
    perform net.http_post(
      url:='https://threads-duo-os.vercel.app/api/cron/publish',
      body:=jsonb_build_object('workspaceId',destination.workspace_id),
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||destination.decrypted_secret),
      timeout_milliseconds:=110000);
  end loop;
end $$;
revoke all on function private.dispatch_threads_queue() from public,anon,authenticated;
select cron.schedule('threads-pro-queue','* * * * *','select private.dispatch_threads_queue();');
comment on column public.drafts.auto_publish is 'Explicit opt-in for the scheduled queue worker. Existing manual schedules remain manual.';
comment on column public.drafts.publication_status is 'Publishing result; immediate and opt-in scheduled posts share the existing engine.';
notify pgrst,'reload schema';
commit;
