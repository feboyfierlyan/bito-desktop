-- Allowlist testing users
insert into public.demo_members (email, active)
values
  ('rizkiaakbar.rzxdn@gmail.com', true),
  ('arimbijati2@gmail.com', true),
  ('muhammad.contact.id@gmail.com', true)
on conflict (email) do update set active = true;
