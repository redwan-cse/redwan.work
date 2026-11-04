-- 0001_extensions_sequences_and_enums.sql
-- Ground-up v2 schema for redwan.work (Service Commerce, Order Execution & Client Retention CRM)

create extension if not exists pgcrypto;

-- Reference code sequences
create sequence if not exists public.inquiry_num_seq start 1001;
create sequence if not exists public.proposal_num_seq start 1001;
create sequence if not exists public.order_num_seq start 1001;
create sequence if not exists public.deliverable_num_seq start 1001;
create sequence if not exists public.invoice_num_seq start 1001;
create sequence if not exists public.payment_num_seq start 1001;
create sequence if not exists public.credit_note_num_seq start 1001;
create sequence if not exists public.ticket_num_seq start 1001;

-- Core domain enumerations
create type public.user_role as enum ('admin', 'client');

create type public.client_tier as enum ('standard', 'vip', 'retainer', 'enterprise');

create type public.service_pillar as enum (
  'cybersecurity',
  'development',
  'cloud_devops',
  'ai_ml',
  'tech_support'
);

create type public.inquiry_status as enum (
  'new',
  'reviewing',
  'proposal_sent',
  'converted',
  'archived'
);

create type public.proposal_status as enum (
  'draft',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired'
);

create type public.order_status as enum (
  'awaiting_payment',
  'pending_requirements',
  'queued',
  'in_progress',
  'in_review',
  'delivered',
  'revision_requested',
  'completed',
  'on_hold',
  'cancelled'
);

create type public.order_priority as enum ('standard', 'priority', 'urgent_24h');

create type public.pricing_model as enum (
  'fixed_package',
  'custom_milestone',
  'hourly',
  'retainer'
);

create type public.deliverable_status as enum (
  'submitted',
  'accepted',
  'revision_requested'
);

create type public.invoice_status as enum (
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'void'
);

create type public.payment_method as enum (
  'bank_transfer',
  'bkash',
  'nagad',
  'wise',
  'payoneer',
  'paypal',
  'manual'
);

create type public.payment_status as enum ('submitted', 'confirmed', 'rejected');

create type public.ticket_category as enum (
  'technical_support',
  'security_incident',
  'order_question',
  'billing',
  'retainer_request',
  'general'
);

create type public.ticket_priority as enum ('low', 'medium', 'high', 'urgent');

create type public.ticket_status as enum (
  'open',
  'in_progress',
  'answered',
  'awaiting_client',
  'resolved',
  'closed'
);

-- Shared updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
