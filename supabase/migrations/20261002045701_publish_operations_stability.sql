begin;
-- A job is the existing draft. Attempts change on retry; the job key does not.
alter table public.drafts
  add column publish_job_id uuid not null default gen_random_uuid(),
  add column publish_lease_until timestamptz,
  add column publish_simulated boolean not null default false,
  add column publish_simulation_scenario text check(publish_simulation_scenario in ('success','transient','permanent','ambiguous'));
create unique index drafts_publish_job_key on public.drafts(publish_job_id);
alter table public.drafts drop constraint drafts_publish_stage_check;
alter table public.drafts add constraint drafts_publish_stage_check check(publish_stage in
 ('scheduled','queued','processing','container_created','publishing','published','retry_wait','failed','needs_attention','cancelled','test_completed'));
update public.drafts set publish_lease_until=publish_started_at+interval '10 minutes' where publication_status='publishing';

create table public.publish_job_events(
 id bigint generated always as identity primary key,
 workspace_id uuid not null, draft_id uuid not null, job_id uuid not null, attempt_id uuid,
 actor_user_id uuid references public.profiles(id),
 from_state text, to_state text not null, mode text, simulated boolean not null,
 retry_count integer not null, error_code text, summary text,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(draft_id,workspace_id) references public.drafts(id,workspace_id)
);
create index publish_events_draft_time on public.publish_job_events(workspace_id,draft_id,created_at,id);
create index publish_events_actor on public.publish_job_events(actor_user_id);
alter table public.publish_job_events enable row level security;
revoke all on public.publish_job_events from public,anon,authenticated;
grant select on public.publish_job_events to authenticated;
create policy publish_events_member_read on public.publish_job_events for select to authenticated
 using(workspace_id in(select private.current_workspace_ids()));
create function private.record_publish_job_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or old.publish_stage is distinct from new.publish_stage
  or old.publish_attempt_id is distinct from new.publish_attempt_id
  or old.publish_job_id is distinct from new.publish_job_id then
  insert into public.publish_job_events(workspace_id,draft_id,job_id,attempt_id,actor_user_id,
    from_state,to_state,mode,simulated,retry_count,error_code,summary)
  values(new.workspace_id,new.id,new.publish_job_id,new.publish_attempt_id,auth.uid(),
    case when tg_op='UPDATE' then old.publish_stage end,new.publish_stage,new.publish_mode,
    new.publish_simulated,new.publish_retry_count,new.publish_error_code,left(new.publish_error,300));
 end if;
 return new;
end $$;
revoke all on function private.record_publish_job_event() from public,anon,authenticated;
create trigger drafts_record_publish_job after insert or update on public.drafts for each row execute function private.record_publish_job_event();

create function private.stabilize_publish_job_fields() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.publish_stage:=case when new.scheduled_at is not null and new.status='approved' then 'scheduled' else 'queued' end;
 elsif old.publish_retryable and old.publication_status not in ('publishing','published') and
  (old.body is distinct from new.body or old.status is distinct from new.status or old.scheduled_at is distinct from new.scheduled_at
   or old.selected_threads_account_id is distinct from new.selected_threads_account_id or old.deleted_at is distinct from new.deleted_at) then
  new.publish_job_id:=gen_random_uuid(); new.publish_simulated:=false; new.publish_simulation_scenario:=null;
  new.publish_attempt_id:=null; new.publish_lease_until:=null; new.publish_error_code:=null;
  new.publish_stage:=case when new.deleted_at is not null or (old.scheduled_at is not null and new.scheduled_at is null) then 'cancelled'
    when new.scheduled_at is not null and new.status='approved' then 'scheduled' else 'queued' end;
 end if;
 return new;
end $$;
revoke all on function private.stabilize_publish_job_fields() from public,anon,authenticated;
create trigger drafts_stability_fields before insert or update on public.drafts for each row execute function private.stabilize_publish_job_fields();

-- Preserve the existing LIVE engine. Extend only orchestration metadata and an
-- explicitly marked, credential-free simulation which can never save post IDs.
alter function private.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb) rename to threads_publish_operation_pipeline;
revoke all on function private.threads_publish_operation_pipeline(uuid,text,text,uuid,timestamptz,uuid,jsonb) from public,anon,authenticated;
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.threads_publish_operation_pipeline(uuid,text,text,uuid,timestamptz,uuid,jsonb)'::regprocedure);
 if strpos(definition,'d.publish_stage<>''publishing''')=0 then raise exception 'Pipeline contract changed'; end if;
 execute replace(definition,'d.publish_stage<>''publishing''','d.publish_stage not in (''publishing'',''needs_attention'')');
end $$;
create function private.threads_publish_operation(p_workspace_id uuid,p_secret text,p_operation text,p_draft_id uuid default null,
 p_expected_updated_at timestamptz default null,p_attempt_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.drafts; result jsonb; begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.profile_id=auth.uid())
  or not exists(select 1 from private.threads_publishing_config c where c.workspace_id=p_workspace_id
    and char_length(p_secret)>=43 and c.secret_digest=sha256(convert_to(p_secret,'UTF8'))) then
  raise exception 'Server capability required' using errcode='42501'; end if;
 if p_operation='connect' then return private.threads_publish_operation_pipeline(p_workspace_id,p_secret,p_operation,p_draft_id,p_expected_updated_at,p_attempt_id,p_data); end if;
 select * into d from public.drafts where workspace_id=p_workspace_id and id=p_draft_id and deleted_at is null for update;
 if not found then raise exception 'Draft not found' using errcode='P0002'; end if;
 if p_operation='cancel' then
  if d.updated_at is distinct from p_expected_updated_at or d.publication_status in ('publishing','published') or not d.publish_retryable then
   raise exception 'Unsafe cancellation' using errcode='55000'; end if;
  update public.drafts set scheduled_at=null,auto_publish=false,publication_status='unpublished',publish_stage='cancelled',
   publish_simulated=false,publish_simulation_scenario=null,publish_next_retry_at=null,publish_needs_attention=false,
   publish_error=null,publish_error_code=null,publish_lease_until=null where id=d.id returning * into d;
  return to_jsonb(d);
 elsif p_operation='simulate_claim' then
  if d.updated_at is distinct from p_expected_updated_at or d.status<>'approved'
   or d.publication_status not in ('unpublished','failed') or not d.publish_retryable
   or (d.publish_next_retry_at is not null and d.publish_next_retry_at>clock_timestamp())
   or coalesce(p_data->>'scenario','') not in ('success','transient','permanent','ambiguous') then
   raise exception 'Job not ready or already claimed' using errcode='55000'; end if;
  update public.drafts set publication_status='publishing',publish_stage='processing',publish_mode='TEST',
   publish_simulated=true,publish_simulation_scenario=p_data->>'scenario',publish_attempt_id=gen_random_uuid(),
   publish_retry_count=case when d.publication_status='failed' then d.publish_retry_count+1 else 0 end,
   publish_started_at=clock_timestamp(),publish_requested_at=clock_timestamp(),publish_lease_until=clock_timestamp()+interval '10 minutes',
   publish_next_retry_at=null,publish_needs_attention=false,publish_error=null,publish_error_code=null,publish_retryable=false,
   threads_container_id=null,threads_post_id=null,published_at=null where id=d.id returning * into d;
  return to_jsonb(d);
 elsif p_operation in ('simulate_prepare','simulate_publishing','simulate_complete') then
  if not d.publish_simulated or d.publish_mode<>'TEST' or d.publish_attempt_id is distinct from p_attempt_id
   or d.publication_status<>'publishing' then raise exception 'Simulation attempt mismatch' using errcode='55000'; end if;
  if p_operation='simulate_prepare' and d.publish_stage='processing' then
   update public.drafts set publish_stage='container_created' where id=d.id returning * into d;
  elsif p_operation='simulate_publishing' and d.publish_stage='container_created' then
   update public.drafts set publish_stage='publishing' where id=d.id returning * into d;
  elsif p_operation='simulate_complete' and d.publish_stage='publishing' then
   update public.drafts set publication_status='unpublished',publish_stage='test_completed',tested_at=clock_timestamp(),
    publish_lease_until=null,publish_retryable=true where id=d.id returning * into d;
  else raise exception 'Invalid simulation stage' using errcode='55000'; end if;
  return to_jsonb(d);
 end if;
 if p_operation='claim' then
  if d.publish_simulated and d.publish_stage<>'test_completed' then raise exception 'Simulation is isolated' using errcode='55000'; end if;
 elsif d.publish_simulated and p_operation<>'failed' then
  raise exception 'Simulation cannot publish to Meta' using errcode='55000';
 end if;
 result:=private.threads_publish_operation_pipeline(p_workspace_id,p_secret,p_operation,p_draft_id,p_expected_updated_at,p_attempt_id,p_data);
 select * into d from public.drafts where id=p_draft_id;
 if p_operation='claim' then
  update public.drafts set publish_lease_until=clock_timestamp()+interval '10 minutes',publish_simulated=false,publish_simulation_scenario=null where id=d.id returning * into d;
 elsif p_operation in ('failed','published','test_completed') then
  update public.drafts set publish_lease_until=null,
   publish_stage=case when p_operation='failed' and publish_needs_attention then 'needs_attention'
     when p_operation='failed' and publish_next_retry_at is not null then 'retry_wait' else publish_stage end where id=d.id returning * into d;
 end if;
 return to_jsonb(d);
end $$;
revoke all on function private.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.threads_publish_operation(uuid,text,text,uuid,timestamptz,uuid,jsonb) to authenticated;

-- Save + TEST claim are one transaction. A due LIVE worker can never observe
-- the intermediate approved draft and publish a simulation to Meta.
create function public.save_publish_simulation(p_workspace_id uuid,p_secret text,p_post jsonb,p_scenario text)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.drafts; begin
 if coalesce(p_post->>'mode','') not in ('now','schedule') then raise exception 'Simulation mode required' using errcode='22023'; end if;
 select * into d from public.save_categorized_posts(p_workspace_id,jsonb_build_array(p_post));
 return private.threads_publish_operation(p_workspace_id,p_secret,'simulate_claim',d.id,d.updated_at,null,jsonb_build_object('scenario',p_scenario));
end $$;
revoke all on function public.save_publish_simulation(uuid,text,jsonb,text) from public,anon;
grant execute on function public.save_publish_simulation(uuid,text,jsonb,text) to authenticated;

-- Order ties by creation time. Simulation retries never enter the Meta engine.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.product_worker_operation(uuid,text,text,uuid,uuid,jsonb)'::regprocedure);
 if strpos(definition,'order by coalesce(publish_next_retry_at,scheduled_at),id limit 1')=0 then raise exception 'Worker selector changed'; end if;
 definition:=replace(definition,'order by coalesce(publish_next_retry_at,scheduled_at),id limit 1',
   'order by coalesce(publish_next_retry_at,scheduled_at),created_at,id limit 1');
 definition:=replace(definition,'and auto_publish and status=''approved''','and auto_publish and not publish_simulated and status=''approved''');
 execute definition;
end $$;
alter function private.product_worker_operation(uuid,text,text,uuid,uuid,jsonb) rename to product_worker_operation_pipeline;
revoke all on function private.product_worker_operation_pipeline(uuid,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
create function private.product_worker_operation(p_workspace_id uuid,p_secret text,p_operation text,
 p_draft_id uuid default null,p_attempt_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.drafts; actor uuid; previous_subject text; result jsonb; n integer:=0; begin
 if not exists(select 1 from private.threads_publishing_config c where c.workspace_id=p_workspace_id
  and char_length(p_secret)>=43 and c.secret_digest=sha256(convert_to(p_secret,'UTF8'))) then
  raise exception 'Worker capability required' using errcode='42501'; end if;
 if p_operation='recover_stale' then
  for d in select * from public.drafts where workspace_id=p_workspace_id and publication_status='publishing'
   and not publish_needs_attention and coalesce(publish_lease_until,publish_started_at+interval '10 minutes')<clock_timestamp()
   order by publish_started_at limit 20 for update skip locked loop
   if d.publish_stage='processing' and d.threads_container_id is null then
    update public.drafts set publication_status='failed',publish_retryable=true,publish_error_code='STALE_BEFORE_PUBLISH',
     publish_error='실행이 중단되었습니다. 게시 요청 전 단계만 안전하게 재시도합니다.',publish_lease_until=null,
     publish_needs_attention=(d.publish_retry_count>=3),publish_stage=case when d.publish_retry_count>=3 then 'needs_attention' else 'retry_wait' end,
     publish_next_retry_at=case when d.publish_retry_count<3 then clock_timestamp()+case d.publish_retry_count when 0 then interval '1 minute' when 1 then interval '5 minutes' else interval '15 minutes' end end
     where id=d.id;
   else
    -- Keep the claim and content locked. An unknown external outcome is never
    -- replayed. A late confirmed Post ID for this same attempt may still persist.
    update public.drafts set publish_needs_attention=true,publish_stage='needs_attention',publish_error_code='STALE_UNCERTAIN',
     publish_error='게시 결과를 확인해야 합니다. 중복 게시를 막기 위해 잠금을 유지합니다.',publish_next_retry_at=null
     where id=d.id;
   end if;
   n:=n+1;
  end loop;
  return jsonb_build_object('recovered',n);
 elsif p_operation in ('claim_simulation_due','simulate_prepare','simulate_publishing','simulate_complete') then
  select m.profile_id into actor from public.workspace_members m where m.workspace_id=p_workspace_id and m.role='owner' order by joined_at limit 1;
  if actor is null then raise exception 'Owner missing' using errcode='42501'; end if;
  previous_subject:=current_setting('request.jwt.claim.sub',true);perform set_config('request.jwt.claim.sub',actor::text,true);
  if p_operation='claim_simulation_due' then
   select * into d from public.drafts where workspace_id=p_workspace_id and deleted_at is null and publish_simulated
    and publication_status='failed' and publish_retryable and not publish_needs_attention and publish_next_retry_at<=clock_timestamp()
    order by publish_next_retry_at,created_at,id limit 1 for update skip locked;
   if found then result:=private.threads_publish_operation(p_workspace_id,p_secret,'simulate_claim',d.id,d.updated_at,null,
    jsonb_build_object('scenario',d.publish_simulation_scenario)); else result:='null'::jsonb; end if;
  else result:=private.threads_publish_operation(p_workspace_id,p_secret,p_operation,p_draft_id,null,p_attempt_id,p_data); end if;
  perform set_config('request.jwt.claim.sub',coalesce(previous_subject,''),true);return result;
 elsif p_operation='failed' and exists(select 1 from public.drafts where workspace_id=p_workspace_id and id=p_draft_id
   and publish_simulated and publish_attempt_id=p_attempt_id) then
  select m.profile_id into actor from public.workspace_members m where m.workspace_id=p_workspace_id and m.role='owner' order by joined_at limit 1;
  previous_subject:=current_setting('request.jwt.claim.sub',true);perform set_config('request.jwt.claim.sub',actor::text,true);
  result:=private.threads_publish_operation(p_workspace_id,p_secret,p_operation,p_draft_id,null,p_attempt_id,p_data);
  perform set_config('request.jwt.claim.sub',coalesce(previous_subject,''),true);return result;
 end if;
 return private.product_worker_operation_pipeline(p_workspace_id,p_secret,p_operation,p_draft_id,p_attempt_id,p_data);
end $$;
revoke all on function private.product_worker_operation(uuid,text,text,uuid,uuid,jsonb) from public;
grant execute on function private.product_worker_operation(uuid,text,text,uuid,uuid,jsonb) to anon,authenticated;

-- Expose only safe snapshot metadata, not private collector jobs or credentials.
alter table public.threads_post_insight_snapshots
 add column threads_post_id text,
 add column available_metrics text[] not null default '{}',
 add column collection_status text not null default 'collected' check(collection_status in ('collected','partial','unavailable')),
 add column error_code text;
update public.threads_post_insight_snapshots s set threads_post_id=d.threads_post_id,
 available_metrics=array_remove(array[case when views is not null then 'views' end,case when likes is not null then 'likes' end,
 case when replies is not null then 'replies' end,case when reposts is not null then 'reposts' end,case when quotes is not null then 'quotes' end,
 case when shares is not null then 'shares' end],null),collection_status=case when unavailable='{}' then 'collected' else 'partial' end
 from public.drafts d where d.id=s.draft_id;
create function private.prepare_insight_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select threads_post_id into new.threads_post_id from public.drafts where id=new.draft_id and workspace_id=new.workspace_id and publication_status='published';
 if new.threads_post_id is null then raise exception 'Confirmed post required' using errcode='55000'; end if;
 new.available_metrics:=array_remove(array[case when new.views is not null then 'views' end,case when new.likes is not null then 'likes' end,
 case when new.replies is not null then 'replies' end,case when new.reposts is not null then 'reposts' end,case when new.quotes is not null then 'quotes' end,
 case when new.shares is not null then 'shares' end],null);
 new.collection_status:=case when cardinality(new.available_metrics)=0 then 'unavailable' when cardinality(new.available_metrics)=6 then 'collected' else 'partial' end;
 return new;
end $$;
revoke all on function private.prepare_insight_snapshot() from public,anon,authenticated;
create trigger insight_snapshot_metadata before insert on public.threads_post_insight_snapshots for each row execute function private.prepare_insight_snapshot();
-- Job ID fencing: an expired collector's response cannot complete a newer lease.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.threads_insight_operation(uuid,text,text,jsonb)'::regprocedure);
 definition:=replace(definition,'''postId'',d.threads_post_id','''postId'',d.threads_post_id,''attempt'',job.attempts');
 definition:=replace(definition,'job.lease_until<clock_timestamp() then',
  'job.lease_until<clock_timestamp() or job.attempts is distinct from (p_data->>''attempt'')::integer then');
 definition:=replace(definition,'shares,unavailable)', 'shares,unavailable,error_code)');
 definition:=replace(definition,'coalesce(p_data->''unavailable'',''{}''))'||chr(10)||'      on conflict(draft_id,after_hours)',
   'coalesce(p_data->''unavailable'',''{}''),left(p_data->>''errorCode'',40))'||chr(10)||'      on conflict(draft_id,after_hours)');
 definition:=replace(definition,'-- Coalesce missed checkpoints',
   'update private.threads_insight_jobs set state=''unavailable'',lease_until=null where workspace_id=p_workspace_id and state=''collecting'' and lease_until<clock_timestamp() and attempts>=3;'||chr(10)||'    -- Coalesce missed checkpoints');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
