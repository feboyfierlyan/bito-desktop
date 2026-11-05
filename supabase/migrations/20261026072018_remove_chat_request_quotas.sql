-- Owner requested Google AI Studio project spend cap as the cost control.
-- Remove app daily/minute quotas and the two-user global concurrency cap.
-- Legacy demo_policy allowance columns remain for migration compatibility only.
-- Preserve membership checks, revocation, leases and single-flight idempotency.
create or replace function public.bito_reserve(p_uid uuid, p_device uuid, p_id uuid,
  p_contents jsonb default null, p_instructions text default null, p_round integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare policy public.demo_policy; job public.demo_jobs;
begin
  -- One transaction serializes lease + idempotency checks across all
  -- concurrent invocations/devices, not just a single Edge worker.
  perform pg_advisory_xact_lock(7348921);
  if not exists(select 1 from public.demo_members where user_id=p_uid and active)
    then raise exception 'access_denied'; end if;
  select * into policy from public.demo_policy where id;
  if not found or not policy.enabled then raise exception 'demo_paused'; end if;
  update public.demo_jobs set status='error', pending='[]', contents='[]', instructions=''
    where status in ('running','waiting') and lease_until < now();
  delete from public.demo_jobs where created_at < now() - interval '1 day';
  if p_round is null then
    if exists(select 1 from public.demo_jobs where id=p_id) then raise exception 'request_exists'; end if;
    if p_contents is null or p_instructions is null or octet_length(p_contents::text) > 160000
      or length(p_instructions)>12000 then raise exception 'invalid_request'; end if;
    if exists(select 1 from public.demo_jobs where user_id=p_uid and status in ('running','waiting'))
      then raise exception 'busy'; end if;
  else
    select * into job from public.demo_jobs where id=p_id and user_id=p_uid and device_id=p_device for update;
    if not found or job.status <> 'waiting' or job.round <> p_round or job.round >= 4
      then raise exception 'invalid_job'; end if;
    if p_contents is null or octet_length(p_contents::text)>180000 then raise exception 'invalid_request'; end if;
  end if;
  if p_round is null then
    insert into public.demo_jobs(id,user_id,device_id,status,contents,instructions)
      values(p_id,p_uid,p_device,'running',p_contents,p_instructions) returning * into job;
  else
    update public.demo_jobs set status='running', round=round+1, contents=p_contents,
      pending='[]', lease_until=now()+interval '100 seconds', updated_at=now()
      where id=p_id returning * into job;
  end if;
  -- Record each invocation for usage accounting, without a chat allowance.
  insert into public.demo_usage(job_id,user_id,round) values(p_id,p_uid,job.round);
  return to_jsonb(job);
end $$;

revoke all on function public.bito_reserve(uuid,uuid,uuid,jsonb,text,integer) from public, anon, authenticated;
grant execute on function public.bito_reserve(uuid,uuid,uuid,jsonb,text,integer) to service_role;
