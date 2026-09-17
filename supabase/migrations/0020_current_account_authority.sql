-- Additive account cutoff; no auth-schema mutation and no production execution.
alter table public.profiles add column tokens_valid_after bigint not null default 0;
create function public.current_account_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id=auth.uid() and p.is_active is true
    and p.role=coalesce(auth.jwt()->'app_metadata'->>'role','')
    and case when coalesce(auth.jwt()->>'iat','') ~ '^[0-9]+$'
      then (auth.jwt()->>'iat')::numeric >= p.tokens_valid_after else false end
$$;
revoke all on function public.current_account_role() from public;
grant execute on function public.current_account_role() to anon,authenticated,service_role;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_account_role()='admin',false)
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon,authenticated,service_role;

create function public.invalidate_changed_account_tokens()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role or (old.is_active is true and new.is_active is false) then
    new.tokens_valid_after:=greatest(old.tokens_valid_after,floor(extract(epoch from clock_timestamp()))::bigint+1);
  elsif new.tokens_valid_after<old.tokens_valid_after then
    raise exception 'Account token cutoff cannot move backward';
  end if;
  return new;
end;
$$;
revoke all on function public.invalidate_changed_account_tokens() from public,anon,authenticated;
create trigger invalidate_changed_account_tokens before update on public.profiles
for each row execute function public.invalidate_changed_account_tokens();

-- A restrictive gate composes with existing ownership policies, never widens them.
create policy current_profile_authority on public.profiles as restrictive for all to authenticated using(public.current_account_role() is not null) with check(public.current_account_role() is not null);
create policy current_ticket_authority on public.tickets as restrictive for all to authenticated using(public.current_account_role() is not null) with check(public.current_account_role() is not null);
create policy current_message_authority on public.ticket_messages as restrictive for all to authenticated using(public.current_account_role() is not null) with check(public.current_account_role() is not null);
create policy current_project_authority on public.projects as restrictive for all to authenticated using(public.current_account_role() is not null) with check(public.current_account_role() is not null);
create policy current_milestone_authority on public.milestones as restrictive for all to authenticated using(public.current_account_role() is not null) with check(public.current_account_role() is not null);
create policy current_file_authority on public.files as restrictive for all to authenticated using(public.current_account_role() is not null) with check(public.current_account_role() is not null);
create policy current_invoice_authority on public.invoices as restrictive for all to authenticated using(public.current_account_role() is not null) with check(public.current_account_role() is not null);
create policy current_item_authority on public.invoice_items as restrictive for all to authenticated using(public.current_account_role() is not null) with check(public.current_account_role() is not null);
create policy current_payment_authority on public.payments as restrictive for all to authenticated using(public.current_account_role() is not null) with check(public.current_account_role() is not null);
-- Administrative mutations must use guarded server operations, not stale JWT policies.
drop policy if exists profiles_admin_update_all on public.profiles;
drop policy if exists tickets_update_admin on public.tickets;
