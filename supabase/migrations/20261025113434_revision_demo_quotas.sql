-- Revision/demo allowance approved by the owner on 2026-10-25.
-- Keep usage history, per-minute limits, and all membership/auth checks intact.
update public.demo_policy
set daily_user = 200,
    daily_global = 400
where id = true;
