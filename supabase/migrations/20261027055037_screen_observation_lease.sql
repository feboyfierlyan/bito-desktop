-- Read-only model-selected screen inspection shares the waiting chat lease.
-- No image bytes enter Postgres. Only one inspection is allowed per chat turn.
alter table public.demo_jobs add column screen_observation text not null default 'none'
  check (screen_observation in ('none','active','done'));

create function public.bito_screen_observation(p_uid uuid, p_device uuid, p_id uuid,
  p_round integer, p_call uuid, p_question text, p_finish boolean default false,
  p_input integer default 0, p_output integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.demo_jobs;
begin
  if not exists(select 1 from public.demo_members where user_id=p_uid and active)
    then raise exception 'access_denied'; end if;
  if not exists(select 1 from public.demo_policy where id and enabled)
    then raise exception 'demo_paused'; end if;
  select * into job from public.demo_jobs
    where id=p_id and user_id=p_uid and device_id=p_device for update;
  if not found or job.round <> p_round or job.lease_until < now()
    or right(job.instructions, length(E'\n[BITO_SCREEN_GUIDE_V1]')) <> E'\n[BITO_SCREEN_GUIDE_V1]'
    or not exists(select 1 from jsonb_array_elements(job.pending) c
      where c->>'id'=p_call::text and c->>'name'='inspect_screen'
      and c->'args'->>'question'=p_question)
    then raise exception 'invalid_job'; end if;
  if p_finish then
    if job.status <> 'running' or job.screen_observation <> 'active'
      or p_input is null or p_output is null or p_input < 0 or p_output < 0
      or p_input > 2000000 or p_output > 2000000 then raise exception 'invalid_job'; end if;
    update public.demo_jobs set status='waiting', screen_observation='done',
      lease_until=now()+interval '10 minutes', updated_at=now()
      where id=p_id returning * into job;
    update public.demo_usage set input_tokens=input_tokens+p_input, output_tokens=output_tokens+p_output
      where job_id=p_id and round=p_round;
  else
    if job.status <> 'waiting' or job.screen_observation <> 'none'
      then raise exception 'invalid_job'; end if;
    update public.demo_jobs set status='running', screen_observation='active',
      lease_until=now()+interval '100 seconds', updated_at=now()
      where id=p_id returning * into job;
  end if;
  return to_jsonb(job);
end $$;
revoke all on function public.bito_screen_observation(uuid,uuid,uuid,integer,uuid,text,boolean,integer,integer)
  from public, anon, authenticated;
grant execute on function public.bito_screen_observation(uuid,uuid,uuid,integer,uuid,text,boolean,integer,integer)
  to service_role;
