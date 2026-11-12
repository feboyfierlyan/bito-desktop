-- Allowlist testing user
insert into public.demo_members (email, active)
values ('rizkiaakbar.rzxdn@gmail.com', true)
on conflict (email) do update set active = true;
