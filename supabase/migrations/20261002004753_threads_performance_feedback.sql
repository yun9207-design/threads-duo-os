begin;
alter table public.content_plans add column performance_feedback boolean not null default false;
grant insert(performance_feedback) on public.content_plans to authenticated;
comment on column public.content_plans.performance_feedback is 'Opt-in to real sufficient-sample Threads feedback; context is recomputed server-side.';
notify pgrst,'reload schema';
commit;
