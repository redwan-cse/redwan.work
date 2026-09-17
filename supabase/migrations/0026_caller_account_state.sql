-- A disabled profile stays unreadable through table RLS. Expose only the
-- caller's own coarse account state so logout can preserve accurate UI feedback.
create function public.caller_account_state()
returns text language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then 'unavailable'
  when exists(select 1 from public.profiles where id=auth.uid() and is_active is false) then 'inactive'
  when public.current_account_role() is null then 'reauthenticate'
  else 'active' end
$$;
revoke all on function public.caller_account_state() from public,anon;
grant execute on function public.caller_account_state() to authenticated,service_role;
