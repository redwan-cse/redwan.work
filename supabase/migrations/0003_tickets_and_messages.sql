-- 0003_tickets_and_messages.sql
create type ticket_status as enum ('open', 'answered', 'awaiting_client', 'closed');

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('entity_number_seq'),
  client_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  status ticket_status not null default 'open',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index tickets_number_key on public.tickets (number);
create index tickets_inbox_idx on public.tickets (status, last_message_at desc);
create index tickets_client_idx on public.tickets (client_id);

alter table public.tickets enable row level security;

create policy "tickets_select_own_or_admin"
  on public.tickets for select
  using (client_id = auth.uid() or public.is_admin());

create policy "tickets_insert_own"
  on public.tickets for insert
  with check (client_id = auth.uid());

create policy "tickets_update_admin"
  on public.tickets for update
  using (public.is_admin());

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index ticket_messages_thread_idx on public.ticket_messages (ticket_id, created_at);

alter table public.ticket_messages enable row level security;

create policy "ticket_messages_select_via_ticket"
  on public.ticket_messages for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and (t.client_id = auth.uid() or public.is_admin())
    )
  );

create policy "ticket_messages_insert_own_in_own_ticket"
  on public.ticket_messages for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and (t.client_id = auth.uid() or public.is_admin())
    )
  );

-- Author-based ticket maintenance (spec §3): client reply -> open, admin reply ->
-- answered; last_message_at always bumped. SECURITY DEFINER because clients have
-- no tickets UPDATE policy; invoker-rights would silently skip the update in P3c.
create or replace function public.apply_ticket_message_side_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_role text;
begin
  select p.role::text into v_author_role
    from public.profiles p
    where p.id = new.author_id;

  update public.tickets
    set status = case
          when v_author_role = 'admin' then 'answered'::public.ticket_status
          else 'open'::public.ticket_status
        end,
        last_message_at = now()
    where id = new.ticket_id;

  return new;
end;
$$;

create trigger on_ticket_message_created
  after insert on public.ticket_messages
  for each row execute function public.apply_ticket_message_side_effects();
