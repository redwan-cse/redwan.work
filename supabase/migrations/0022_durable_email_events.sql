create table public.email_outbox (
 id uuid primary key default gen_random_uuid(),
 template text not null check(template in('new-ticket','reply-posted','status-changed','deliverable-uploaded','invoice-issued','payment-confirmed')),
 entity_type text not null,
 entity_id uuid not null,
 recipient_id uuid,
 payload jsonb not null,
 envelope jsonb,
 state text not null default 'pending' check(state in('pending','processing','accepted','failed','suppressed')),
 attempts int not null default 0,
 lease_token uuid,
 lease_until timestamptz,
 next_attempt_at timestamptz not null default now(),
 first_attempt_at timestamptz,
 provider_id text,
 error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon,authenticated;
grant all on public.email_outbox to service_role;
create index email_outbox_pending_idx on public.email_outbox(next_attempt_at,created_at) where state in('pending','processing');

create function public.enqueue_lifecycle_email(p_template text,p_type text,p_entity uuid,p_recipient uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.email_outbox(template,entity_type,entity_id,recipient_id,payload,state,error_code)
 values(p_template,p_type,p_entity,p_recipient,p_payload,case when p_recipient is null then 'failed' else 'pending' end,case when p_recipient is null then 'recipient_unavailable' else null end);
end;$$;
create function public.capture_lifecycle_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_template text;v_entity uuid;v_type text;v_client uuid;v_admins boolean:=false;v_payload jsonb;v_ticket public.tickets%rowtype;v_invoice public.invoices%rowtype;v_role text;v_name text;v_recipient uuid;v_total bigint;v_paid bigint;v_found boolean:=false;
begin
 if tg_table_name='tickets' then
   v_ticket:=new;v_entity:=new.id;v_type:='ticket';v_client:=new.client_id;
   if tg_op='INSERT' then v_template:='new-ticket';v_admins:=true;
   elsif new.status is distinct from old.status and pg_trigger_depth()=1 then v_template:='status-changed';
   else return new;end if;
   v_payload:=jsonb_build_object('ticketNumber',new.number,'subject',new.subject,'status',new.status);
 elsif tg_table_name='ticket_messages' then
   select * into v_ticket from public.tickets where id=new.ticket_id;
   select role,full_name into v_role,v_name from public.profiles where id=new.author_id;
   -- The first client-authored message belongs to new-ticket, not a second reply event.
   if v_role='client' and (select count(*) from public.ticket_messages where ticket_id=new.ticket_id)=1 then return new;end if;
   v_template:='reply-posted';v_type:='ticket';v_entity:=new.ticket_id;v_client:=v_ticket.client_id;v_admins:=v_role<>'admin';
   v_payload:=jsonb_build_object('ticketNumber',v_ticket.number,'subject',v_ticket.subject,'authorName',coalesce(v_name,case when v_role='admin' then 'Support' else 'Client' end),'bodyPreview',left(new.body,300),'adminAudience',v_admins);
 elsif tg_table_name='files' then
   if new.kind<>'deliverable' then return new;end if;
   select client_id into v_client from public.projects where id=new.project_id;
   v_template:='deliverable-uploaded';v_type:='deliverable';v_entity:=new.id;
   v_payload:=jsonb_build_object('projectName',(select name from public.projects where id=new.project_id),'filename',new.filename);
 elsif tg_table_name='invoices' then
   if new.status<>'sent' or old.status='sent' then return new;end if;
   select client_id into v_client from public.projects where id=new.project_id;
   v_template:='invoice-issued';v_type:='invoice';v_entity:=new.id;
   v_payload:=jsonb_build_object('invoiceNumber',new.number,'amountCents',public.invoice_total_cents(new.id),'currency',new.currency,'dueLabel',new.due_at);
 elsif tg_table_name='payments' then
   if new.status<>'confirmed' or old.status='confirmed' then return new;end if;
   select * into v_invoice from public.invoices where id=new.invoice_id;
   select client_id into v_client from public.projects where id=v_invoice.project_id;
   v_template:='payment-confirmed';v_type:='invoice';v_entity:=new.invoice_id;
   v_total:=public.invoice_total_cents(new.invoice_id);
   select coalesce(sum(amount_cents),0) into v_paid from public.payments where invoice_id=new.invoice_id and status='confirmed';
   v_payload:=jsonb_build_object('invoiceNumber',v_invoice.number,'amountCents',new.amount_cents,'currency',v_invoice.currency,'outstandingCents',greatest(v_total-v_paid,0));
 else return new;end if;
 if v_admins then
   for v_recipient in select id from public.profiles where role='admin' and is_active is true loop
     perform public.enqueue_lifecycle_email(v_template,v_type,v_entity,v_recipient,v_payload);v_found:=true;
   end loop;
   if not v_found then perform public.enqueue_lifecycle_email(v_template,v_type,v_entity,null,v_payload);end if;
 else perform public.enqueue_lifecycle_email(v_template,v_type,v_entity,v_client,v_payload);end if;
 return new;
end;$$;
create trigger capture_ticket_email after insert or update of status on public.tickets for each row execute function public.capture_lifecycle_email();
create trigger capture_reply_email after insert on public.ticket_messages for each row execute function public.capture_lifecycle_email();
create trigger capture_deliverable_email after insert on public.files for each row execute function public.capture_lifecycle_email();
create trigger capture_invoice_email after update of status on public.invoices for each row execute function public.capture_lifecycle_email();
create trigger capture_payment_email after update of status on public.payments for each row execute function public.capture_lifecycle_email();

create function public.claim_email_event()
returns setof public.email_outbox language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 -- Never blindly retry beyond the provider's 24-hour idempotency horizon.
 update public.email_outbox set state='failed',error_code='retry_horizon_exceeded',updated_at=now()
 where state in('pending','processing') and (lease_until is null or lease_until<now()) and first_attempt_at<now()-interval '23 hours';
 select id into v_id from public.email_outbox
 where state in('pending','processing') and next_attempt_at<=now() and (lease_until is null or lease_until<now()) and attempts<5
 order by created_at,id for update skip locked limit 1;
 if not found then return;end if;
 return query update public.email_outbox set state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',first_attempt_at=coalesce(first_attempt_at,now()),updated_at=now() where id=v_id returning *;
end;$$;
create function public.finish_email_event(p_id uuid,p_lease uuid,p_state text,p_provider text,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_row public.email_outbox%rowtype;
begin
 if p_state not in('accepted','pending','failed','suppressed') or (p_error is not null and p_error not in('configuration_unavailable','recipient_unavailable','inactive_recipient','render_failed','provider_rejected','provider_unavailable','provider_timeout','audit_unavailable')) then raise exception 'Invalid email outcome';end if;
 select * into v_row from public.email_outbox where id=p_id and lease_token=p_lease and state='processing' for update;
 if not found then return false;end if;
 update public.email_outbox set state=case when p_state='pending' and attempts>=5 then 'failed' else p_state end,provider_id=p_provider,error_code=p_error,lease_until=null,lease_token=null,next_attempt_at=now()+interval '5 minutes',updated_at=now() where id=p_id;
 insert into public.email_log(to_email,template,entity_type,entity_id,resend_id,status,error)
 values(coalesce(v_row.envelope->>'to','unknown'),v_row.template,v_row.entity_type,v_row.entity_id,p_provider,case when p_state='accepted' then 'sent' else 'failed' end,p_error);
 return true;
end;$$;
revoke all on function public.enqueue_lifecycle_email(text,text,uuid,uuid,jsonb),public.capture_lifecycle_email(),public.claim_email_event(),public.finish_email_event(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_email_event(),public.finish_email_event(uuid,uuid,text,text,text) to service_role;
