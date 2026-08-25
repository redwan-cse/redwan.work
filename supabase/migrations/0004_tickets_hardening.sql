-- 0004_tickets_hardening.sql
alter table public.tickets
  add constraint tickets_subject_length
  check (char_length(btrim(subject)) between 1 and 200);

-- P3b review follow-up: direct REST inserts by authenticated clients must not
-- choose their own ticket number/status/timestamps. Service-role (all app
-- mutations) passes through untouched.
create or replace function public.enforce_ticket_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  new.number := nextval('public.entity_number_seq'::regclass);
  new.status := 'open'::public.ticket_status;
  new.last_message_at := now();
  new.created_at := now();
  return new;
end;
$$;

create trigger enforce_ticket_defaults_before_insert
  before insert on public.tickets
  for each row execute function public.enforce_ticket_defaults();
