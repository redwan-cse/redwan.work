-- 0006_order_chat_and_support_tickets.sql
-- Contextual Order Messages, Support Tickets & Threaded Ticket Messages with Internal Admin Notes

create table public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  is_internal_note boolean not null default false,
  attachment_file_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index order_messages_order_idx on public.order_messages (order_id, created_at);

alter table public.order_messages enable row level security;

create policy "order_messages_select_client_or_admin"
  on public.order_messages for select
  using (
    public.is_admin() or (
      is_internal_note is false and exists (
        select 1 from public.orders o
        where o.id = order_id and o.client_id = auth.uid()
      )
    )
  );

create policy "order_messages_insert_client_or_admin"
  on public.order_messages for insert
  with check (
    author_id = auth.uid() and (
      public.is_admin() or (
        is_internal_note is false and exists (
          select 1 from public.orders o
          where o.id = order_id and o.client_id = auth.uid()
        )
      )
    )
  );

create policy "order_messages_admin_all"
  on public.order_messages for all
  using (public.is_admin())
  with check (public.is_admin());

-- Support & Warranty Tickets (TKT-1001)
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.ticket_num_seq') unique,
  code text generated always as ('TKT-' || number::text) stored,
  client_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  category public.ticket_category not null default 'general',
  priority public.ticket_priority not null default 'medium',
  subject text not null check (char_length(btrim(subject)) between 1 and 250),
  status public.ticket_status not null default 'open',
  first_responded_at timestamptz,
  resolved_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tickets_inbox_idx on public.tickets (status, priority desc, last_message_at desc);
create index tickets_client_idx on public.tickets (client_id, last_message_at desc);
create index tickets_order_idx on public.tickets (order_id) where order_id is not null;

create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

alter table public.tickets enable row level security;

create policy "tickets_select_own_or_admin"
  on public.tickets for select
  using (client_id = auth.uid() or public.is_admin());

create policy "tickets_insert_own"
  on public.tickets for insert
  with check (client_id = auth.uid());

create policy "tickets_admin_all"
  on public.tickets for all
  using (public.is_admin())
  with check (public.is_admin());

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  is_internal_note boolean not null default false,
  attachment_file_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index ticket_messages_thread_idx on public.ticket_messages (ticket_id, created_at);

alter table public.ticket_messages enable row level security;

create policy "ticket_messages_select_client_or_admin"
  on public.ticket_messages for select
  using (
    public.is_admin() or (
      is_internal_note is false and exists (
        select 1 from public.tickets t
        where t.id = ticket_id and t.client_id = auth.uid()
      )
    )
  );

create policy "ticket_messages_insert_client_or_admin"
  on public.ticket_messages for insert
  with check (
    author_id = auth.uid() and (
      public.is_admin() or (
        is_internal_note is false and exists (
          select 1 from public.tickets t
          where t.id = ticket_id and t.client_id = auth.uid()
        )
      )
    )
  );

create policy "ticket_messages_admin_all"
  on public.ticket_messages for all
  using (public.is_admin())
  with check (public.is_admin());

-- Automatic ticket status & SLA timestamp maintenance on reply
create or replace function public.apply_ticket_message_side_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_role public.user_role;
begin
  if new.is_internal_note is true then
    return new;
  end if;

  select p.role into v_author_role
    from public.profiles p
    where p.id = new.author_id;

  update public.tickets
    set status = case
          when v_author_role = 'admin' then 'answered'::public.ticket_status
          else 'open'::public.ticket_status
        end,
        first_responded_at = case
          when v_author_role = 'admin' and first_responded_at is null then now()
          else first_responded_at
        end,
        last_message_at = now(),
        updated_at = now()
    where id = new.ticket_id;

  return new;
end;
$$;

create trigger on_ticket_message_created
  after insert on public.ticket_messages
  for each row execute function public.apply_ticket_message_side_effects();
