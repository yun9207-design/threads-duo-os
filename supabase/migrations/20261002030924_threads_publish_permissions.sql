begin;
-- Keep the existing private credential store, owner/state checks and TEST gate.
-- Optional Insights permission must not prevent a publishing-only connection.
do $$ declare definition text; old_permissions text:='["threads_basic","threads_content_publish","threads_manage_insights"]'; begin
  definition:=pg_get_functiondef('private.threads_account_operation(uuid,text,text,jsonb)'::regprocedure);
  if strpos(definition,old_permissions)=0 then raise exception 'Account permission contract changed'; end if;
  execute replace(definition,old_permissions,'["threads_basic","threads_content_publish"]');
end $$;
notify pgrst,'reload schema';
commit;
