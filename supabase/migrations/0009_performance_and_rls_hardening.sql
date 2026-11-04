-- =============================================================================
-- 0009_performance_and_rls_hardening.sql
-- Adds covering indexes for all foreign keys flagged by Supabase Advisor
-- and an explicit deny-all RLS policy on public.rate_limits.
-- =============================================================================

create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists cancellation_requests_requested_by_idx on public.cancellation_requests (requested_by);
create index if not exists cancellation_requests_resolved_by_idx on public.cancellation_requests (resolved_by);
create index if not exists client_invitations_accepted_user_id_idx on public.client_invitations (accepted_user_id);
create index if not exists client_invitations_invited_by_idx on public.client_invitations (invited_by);
create index if not exists client_notes_author_id_idx on public.client_notes (author_id);
create index if not exists client_reviews_client_id_idx on public.client_reviews (client_id);
create index if not exists credit_notes_client_id_idx on public.credit_notes (client_id);
create index if not exists credit_notes_issued_by_idx on public.credit_notes (issued_by);
create index if not exists deliverables_milestone_id_idx on public.deliverables (milestone_id);
create index if not exists deliverables_reviewed_by_idx on public.deliverables (reviewed_by);
create index if not exists deliverables_submitted_by_idx on public.deliverables (submitted_by);
create index if not exists engagement_authorizations_client_id_idx on public.engagement_authorizations (client_id);
create index if not exists inquiries_converted_client_id_idx on public.inquiries (converted_client_id);
create index if not exists invoices_milestone_id_idx on public.invoices (milestone_id);
create index if not exists order_messages_author_id_idx on public.order_messages (author_id);
create index if not exists order_requirements_client_id_idx on public.order_requirements (client_id);
create index if not exists order_tasks_milestone_id_idx on public.order_tasks (milestone_id);
create index if not exists orders_inquiry_id_idx on public.orders (inquiry_id);
create index if not exists orders_package_id_idx on public.orders (package_id);
create index if not exists orders_proposal_id_idx on public.orders (proposal_id);
create index if not exists orders_service_id_idx on public.orders (service_id);
create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists payments_proof_file_id_idx on public.payments (proof_file_id);
create index if not exists payments_reviewed_by_idx on public.payments (reviewed_by);
create index if not exists proposals_created_by_idx on public.proposals (created_by);
create index if not exists proposals_inquiry_id_idx on public.proposals (inquiry_id);
create index if not exists proposals_service_id_idx on public.proposals (service_id);
create index if not exists ticket_messages_author_id_idx on public.ticket_messages (author_id);
create index if not exists vault_files_uploaded_by_idx on public.vault_files (uploaded_by);

create policy rate_limits_no_direct_access on public.rate_limits
  for all using (false) with check (false);
