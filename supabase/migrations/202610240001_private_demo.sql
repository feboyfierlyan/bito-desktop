-- Run once in the project's SQL editor, or `supabase db push`.
create table public.demo_members (
  email text primary key check (email = lower(trim(email))),
  user_id uuid unique references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.demo_policy (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  daily_global integer not null default 80 check (daily_global between 1 and 1000),
  daily_user integer not null default 30 check (daily_user between 1 and 1000),
  minute_global integer not null default 8 check (minute_global between 1 and 100),
  minute_user integer not null default 4 check (minute_user between 1 and 100)
);
insert into public.demo_policy(id) values(true);
create table public.demo_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  status text not null check (status in ('running','waiting','complete','error','cancelled')),
  round integer not null default 1 check (round between 1 and 4),
  contents jsonb not null,
  instructions text not null,
  pending jsonb not null default '[]',
  lease_until timestamptz not null default now() + interval '100 seconds',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.demo_jobs(user_id, status);
create table public.demo_usage (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.demo_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  round integer not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  unique(job_id, round)
);
create index on public.demo_usage(created_at, user_id);

alter table public.demo_members enable row level security;
alter table public.demo_policy enable row level security;
alter table public.demo_jobs enable row level security;
alter table public.demo_usage enable row level security;
-- No client-side table policies. Only the authenticated Edge Function may use
-- these records. Dashboard owner remains able to manage the allowlist.
revoke all on public.demo_members, public.demo_policy, public.demo_jobs, public.demo_usage from anon, authenticated;
grant all on public.demo_members, public.demo_policy, public.demo_jobs, public.demo_usage to service_role;
grant usage, select on sequence public.demo_usage_id_seq to service_role;

create function public.bito_revoke_jobs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.demo_jobs set status='cancelled',contents='[]',instructions='',pending='[]',updated_at=now()
    where user_id=new.user_id and status in ('running','waiting');
  return new;
end $$;
create trigger bito_member_revoked after update of active on public.demo_members
  for each row when (old.active and not new.active) execute function public.bito_revoke_jobs();

create function public.bito_claim_member(p_uid uuid, p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  update public.demo_members set user_id = p_uid
    where email = lower(trim(p_email)) and active and (user_id is null or user_id = p_uid)
    returning true into allowed;
  return coalesce(allowed, false);
end $$;

create function public.bito_reserve(p_uid uuid, p_device uuid, p_id uuid,
  p_contents jsonb default null, p_instructions text default null, p_round integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare policy public.demo_policy; job public.demo_jobs; n integer;
begin
  -- One transaction serializes quota + lease + idempotency checks across all
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
  if (select count(*) from public.demo_jobs where status='running') >= 2 then raise exception 'busy'; end if;
  select count(*) into n from public.demo_usage where created_at >= date_trunc('day',now());
  if n >= policy.daily_global then raise exception 'daily_limit'; end if;
  select count(*) into n from public.demo_usage where user_id=p_uid and created_at >= date_trunc('day',now());
  if n >= policy.daily_user then raise exception 'daily_limit'; end if;
  select count(*) into n from public.demo_usage where created_at >= now() - interval '1 minute';
  if n >= policy.minute_global then raise exception 'rate_limit'; end if;
  select count(*) into n from public.demo_usage where user_id=p_uid and created_at >= now() - interval '1 minute';
  if n >= policy.minute_user then raise exception 'rate_limit'; end if;
  if p_round is null then
    insert into public.demo_jobs(id,user_id,device_id,status,contents,instructions)
      values(p_id,p_uid,p_device,'running',p_contents,p_instructions) returning * into job;
  else
    update public.demo_jobs set status='running', round=round+1, contents=p_contents,
      pending='[]', lease_until=now()+interval '100 seconds', updated_at=now()
      where id=p_id returning * into job;
  end if;
  -- Reserve each model invocation, even failed/cancelled ones, conservatively.
  insert into public.demo_usage(job_id,user_id,round) values(p_id,p_uid,job.round);
  return to_jsonb(job);
end $$;

create function public.bito_finish(p_uid uuid, p_device uuid, p_id uuid, p_round integer,
  p_status text, p_contents jsonb, p_pending jsonb, p_input integer default 0, p_output integer default 0)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed uuid;
begin
  if p_status not in ('waiting','complete','error','cancelled') then raise exception 'invalid_request'; end if;
  if not exists(select 1 from public.demo_members where user_id=p_uid and active)
    then raise exception 'access_denied'; end if;
  update public.demo_jobs set status=p_status,
    contents=case when p_status='waiting' then p_contents else '[]'::jsonb end,
    instructions=case when p_status='waiting' then instructions else '' end,
    pending=case when p_status='waiting' then p_pending else '[]'::jsonb end,
    lease_until=now()+interval '10 minutes', updated_at=now()
    where id=p_id and user_id=p_uid and device_id=p_device and round=p_round and status='running'
    returning id into changed;
  if changed is not null then
    update public.demo_usage set input_tokens=greatest(0,p_input),output_tokens=greatest(0,p_output)
      where job_id=p_id and round=p_round;
  end if;
  return changed is not null;
end $$;

create function public.bito_cancel(p_uid uuid, p_device uuid, p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.demo_jobs set status='cancelled', contents='[]',instructions='',pending='[]',updated_at=now()
    where id=p_id and user_id=p_uid and device_id=p_device and status in ('running','waiting');
$$;

-- PostgreSQL functions grant PUBLIC execution by default: remove it explicitly.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('bito_claim_member','bito_reserve','bito_finish','bito_cancel','bito_revoke_jobs')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;
