-- Restore per-user and global rate/daily quotas to prevent Denial-of-Wallet (BITO-001).
-- Shard advisory lock per user to avoid global serialization bottlenecks while
-- keeping global caps safe, add TTL/usage indexes, and scrub expired job contents after 15 minutes.

update public.demo_policy
set daily_global = greatest(daily_global, 500),
    daily_user = greatest(daily_user, 60),
    minute_global = greatest(minute_global, 30),
    minute_user = greatest(minute_user, 8)
where id;

create index if not exists demo_jobs_created_idx on public.demo_jobs(created_at);
create index if not exists demo_jobs_lease_idx on public.demo_jobs(lease_until)
  where status in ('running', 'waiting');
create index if not exists demo_usage_user_created_idx on public.demo_usage(user_id, created_at desc);
create index if not exists demo_usage_created_idx on public.demo_usage(created_at desc);

create or replace function public.bito_claim_member(p_uid uuid, p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare existing_uid uuid; is_active boolean;
begin
  select user_id, active into existing_uid, is_active
    from public.demo_members
    where email = lower(trim(p_email));
  if not found or not is_active then
    return false;
  end if;
  if existing_uid = p_uid then
    return true;
  end if;
  if existing_uid is not null then
    return false;
  end if;
  update public.demo_members
    set user_id = p_uid
    where email = lower(trim(p_email)) and active and user_id is null;
  return found;
end $$;

create or replace function public.bito_cleanup_expired_jobs()
returns integer language plpgsql security definer set search_path = '' as $$
declare scrubbed integer := 0;
begin
  update public.demo_jobs
    set status = 'error', pending = '[]'::jsonb, contents = '[]'::jsonb, instructions = '', screen_observation = 'none', updated_at = now()
    where status in ('running', 'waiting') and lease_until < now();
  get diagnostics scrubbed = row_count;

  update public.demo_jobs
    set pending = '[]'::jsonb, contents = '[]'::jsonb, instructions = '', screen_observation = 'none'
    where created_at < now() - interval '15 minutes'
      and (contents <> '[]'::jsonb or instructions <> '' or screen_observation <> 'none');

  return scrubbed;
end $$;

create or replace function public.bito_reserve(
  p_uid uuid,
  p_device uuid,
  p_id uuid,
  p_contents jsonb default null,
  p_instructions text default null,
  p_round integer default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare policy public.demo_policy; job public.demo_jobs; n integer;
begin
  perform pg_advisory_xact_lock(7348921, hashtext(p_uid::text));

  if not exists(select 1 from public.demo_members where user_id = p_uid and active) then
    raise exception 'access_denied';
  end if;

  select * into policy from public.demo_policy where id;
  if not found or not policy.enabled then
    raise exception 'demo_paused';
  end if;

  perform public.bito_cleanup_expired_jobs();

  if p_round is null then
    if exists(select 1 from public.demo_jobs where id = p_id) then
      raise exception 'request_exists';
    end if;
    if p_contents is null or p_instructions is null
      or octet_length(p_contents::text) > 160000
      or length(p_instructions) > 12000 then
      raise exception 'invalid_request';
    end if;
    if exists(select 1 from public.demo_jobs where user_id = p_uid and status in ('running', 'waiting')) then
      raise exception 'busy';
    end if;
  else
    select * into job from public.demo_jobs
      where id = p_id and user_id = p_uid and device_id = p_device
      for update;
    if not found or job.status <> 'waiting' or job.round <> p_round or job.round >= 4 then
      raise exception 'invalid_job';
    end if;
    if p_contents is null or octet_length(p_contents::text) > 180000 then
      raise exception 'invalid_request';
    end if;
  end if;

  select count(*) into n from public.demo_usage where user_id = p_uid and created_at >= now() - interval '1 minute';
  if n >= policy.minute_user then raise exception 'rate_limit'; end if;

  select count(*) into n from public.demo_usage where created_at >= now() - interval '1 minute';
  if n >= policy.minute_global then raise exception 'rate_limit'; end if;

  select count(*) into n from public.demo_usage where user_id = p_uid and created_at >= date_trunc('day', now());
  if n >= policy.daily_user then raise exception 'daily_limit'; end if;

  select count(*) into n from public.demo_usage where created_at >= date_trunc('day', now());
  if n >= policy.daily_global then raise exception 'daily_limit'; end if;

  if p_round is null then
    insert into public.demo_jobs(id, user_id, device_id, status, contents, instructions)
      values(p_id, p_uid, p_device, 'running', p_contents, p_instructions)
      returning * into job;
  else
    update public.demo_jobs
      set status = 'running',
          round = round + 1,
          contents = p_contents,
          pending = '[]'::jsonb,
          lease_until = now() + interval '100 seconds',
          updated_at = now()
      where id = p_id
      returning * into job;
  end if;

  insert into public.demo_usage(job_id, user_id, round)
    values(p_id, p_uid, job.round);

  return to_jsonb(job);
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'bito-scrub-expired-jobs',
      '*/5 * * * *',
      'select public.bito_cleanup_expired_jobs();'
    );
  end if;
exception when others then
  null;
end $$;

revoke all on function public.bito_claim_member(uuid, text) from public, anon, authenticated;
grant execute on function public.bito_claim_member(uuid, text) to service_role;

revoke all on function public.bito_cleanup_expired_jobs() from public, anon, authenticated;
grant execute on function public.bito_cleanup_expired_jobs() to service_role;

revoke all on function public.bito_reserve(uuid, uuid, uuid, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.bito_reserve(uuid, uuid, uuid, jsonb, text, integer) to service_role;
