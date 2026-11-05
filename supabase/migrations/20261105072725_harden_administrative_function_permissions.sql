-- Supabase's automatic RLS trigger is an administrative hook, not a client RPC.
-- Keep its event trigger and owner privileges; remove unnecessary client grants.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
