begin;
grant update(draft_id) on public.recurring_occurrences to authenticated;
create policy recurring_occurrences_update on public.recurring_occurrences for update to authenticated using(workspace_id in(select private.current_workspace_ids())) with check(workspace_id in(select private.current_workspace_ids()));
create or replace function public.place_content_plan(p_workspace_id uuid,p_plan_id uuid,p_expected_updated_at timestamptz,p_posts jsonb)
 returns setof public.drafts language plpgsql security invoker set search_path='' as $$
declare plan public.content_plans; saved public.drafts; item jsonb; updated_items jsonb:='[]'; slot uuid; begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
 select * into plan from public.content_plans where id=p_plan_id and workspace_id=p_workspace_id and updated_at=p_expected_updated_at for update;
 if not found or plan.status='scheduled' then raise exception 'Plan changed or already scheduled' using errcode='55000'; end if;
 if jsonb_array_length(p_posts)<>jsonb_array_length(plan.items) or jsonb_array_length(p_posts)=0 then raise exception 'Incomplete plan' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_posts) loop
  if item->>'mode'<>'schedule' or not exists(select 1 from jsonb_array_elements(plan.items) i where i->>'aiPostId'=item->>'id') then raise exception 'Review required' using errcode='22023'; end if;
  if exists(select 1 from public.drafts where workspace_id=p_workspace_id and scheduled_at=(item->>'scheduledAt')::timestamptz and deleted_at is null and publication_status<>'failed') then raise exception 'Slot occupied' using errcode='55000'; end if;
 end loop;
 if (select count(distinct value->>'scheduledAt') from jsonb_array_elements(p_posts))<>jsonb_array_length(p_posts) then raise exception 'Duplicate time' using errcode='22023'; end if;
 for saved in select * from public.save_categorized_posts(p_workspace_id,p_posts,true) loop
  select i into item from jsonb_array_elements(plan.items) i join public.ai_generated_posts a on a.id=(i->>'aiPostId')::uuid where a.draft_id=saved.id;
  updated_items:=updated_items||jsonb_build_array(item||jsonb_build_object('draftId',saved.id,'scheduledAt',saved.scheduled_at,'body',saved.body));
  select id into slot from public.recurring_schedules where workspace_id=p_workspace_id and enabled and category_id is not distinct from saved.category_id
   and extract(dow from saved.scheduled_at at time zone 'Asia/Seoul')::integer=any(days)
   and time_of_day=(saved.scheduled_at at time zone 'Asia/Seoul')::time and start_date<=(saved.scheduled_at at time zone 'Asia/Seoul')::date
   and (end_date is null or end_date>=(saved.scheduled_at at time zone 'Asia/Seoul')::date) order by id limit 1;
  if slot is not null then insert into public.recurring_occurrences(workspace_id,schedule_id,scheduled_at,draft_id) values(p_workspace_id,slot,saved.scheduled_at,saved.id)
   on conflict(schedule_id,scheduled_at) do update set draft_id=excluded.draft_id
   where not exists(select 1 from public.drafts d where d.id=recurring_occurrences.draft_id and d.workspace_id=p_workspace_id
    and d.deleted_at is null and d.scheduled_at=recurring_occurrences.scheduled_at and d.publication_status not in('failed'));
   if not found then raise exception 'Recurring slot occupied' using errcode='55000'; end if; end if;
  return next saved;
 end loop;
 update public.content_plans set items=updated_items,status='scheduled' where id=plan.id;
end $$;
notify pgrst,'reload schema';
commit;
