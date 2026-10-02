begin;
alter table public.drafts add column source_template_id text check(char_length(source_template_id) between 1 and 80);
grant insert(source_template_id),update(source_template_id) on public.drafts to authenticated;
create function public.save_csv_posts(p_workspace_id uuid,p_posts jsonb) returns setof public.drafts
language plpgsql security invoker set search_path='' as $$
declare item jsonb; saved public.drafts; template text; position integer:=0;
begin
 if jsonb_typeof(p_posts) is distinct from 'array' or jsonb_array_length(p_posts) not between 1 and 30 then raise exception 'Invalid CSV posts' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_posts) loop
  if item->>'mode' is null or item->>'mode' not in ('draft','schedule') or item ? 'draftId' or item ? 'id' or coalesce((item->>'allowDuplicate')::boolean,false) then raise exception 'CSV creates new drafts only' using errcode='22023'; end if;
  template:=nullif(item->>'templateId','');
  if template is not null and not(template=any(array['info','tip','empathy','question','experience','failure','solution','checklist','comparison','recommend','product','service','blog','youtube','pdf'])) then
   if template !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or not exists(select 1 from public.content_templates where id=template::uuid and workspace_id=p_workspace_id and deleted_at is null) then raise exception 'Template unavailable' using errcode='23503'; end if;
  end if;
 end loop;
 for saved in select * from public.save_categorized_posts(p_workspace_id,p_posts,false) loop
  update public.drafts set source_template_id=nullif(p_posts->position->>'templateId','') where id=saved.id and workspace_id=p_workspace_id returning * into saved;
  position:=position+1;return next saved;
 end loop;
end $$;
revoke all on function public.save_csv_posts(uuid,jsonb) from public,anon;
grant execute on function public.save_csv_posts(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
