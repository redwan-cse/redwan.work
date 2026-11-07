-- =============================================================================
-- 0012_contracts_consent_and_enums.sql
-- Remediates Phase C Broken Contracts:
--   C-1 (CONSENT-CONTRACT): Seed valid canonical v1 (archived) + v2 (active)
--       consent policies matching archivePolicy(), harden contact_consent_control,
--       and enforce active policy version/hash on public.inquiries (PT409/PT503).
--   C-2 (RATE-LIMIT-KINDS): Align rate_limits_kind_check with all app callers.
--   C-3 (UPLOAD-FINALIZE-DOWNLOAD): Align vault_files_category_check and tenant
--       prefix trigger with portal-presign categories.
-- =============================================================================

-- 1. Align rate_limits kind vocabulary across auth, contact, and upload presigners
alter table public.rate_limits
  drop constraint if exists rate_limits_kind_check;

alter table public.rate_limits
  add constraint rate_limits_kind_check check (
    kind in (
      'ip',
      'turnstile',
      'presign',
      'presign-ip',
      'otp',
      'otp-ip',
      'auth',
      'retry-recovery',
      'retry-invite',
      'portal-presign'
    )
  );

-- 2. Align vault_files category check and prefix trigger with portal upload categories
alter table public.vault_files
  drop constraint if exists vault_files_category_check;

alter table public.vault_files
  add constraint vault_files_category_check check (
    category in (
      'deliverable',
      'order_attachment',
      'requirement_attachment',
      'ticket_attachment',
      'payment_proof',
      'roe_document',
      'public_asset'
    )
  );

create or replace function public.enforce_vault_file_tenant_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_client uuid;
  v_invoice_client uuid;
  v_ticket_client uuid;
begin
  if new.order_id is not null then
    select o.client_id into v_order_client from public.orders o where o.id = new.order_id;
    if not found then
      raise exception 'Referenced order does not exist for vault file.';
    end if;
    if new.owner_client_id is not null and new.owner_client_id is distinct from v_order_client then
      raise exception 'Vault file owner_client_id does not match order client_id.';
    end if;
    new.owner_client_id := coalesce(new.owner_client_id, v_order_client);
  end if;

  if new.invoice_id is not null then
    select i.client_id into v_invoice_client from public.invoices i where i.id = new.invoice_id;
    if not found then
      raise exception 'Referenced invoice does not exist for vault file.';
    end if;
    if new.owner_client_id is not null and new.owner_client_id is distinct from v_invoice_client then
      raise exception 'Vault file owner_client_id does not match invoice client_id.';
    end if;
    new.owner_client_id := coalesce(new.owner_client_id, v_invoice_client);
  end if;

  if new.ticket_id is not null then
    select t.client_id into v_ticket_client from public.tickets t where t.id = new.ticket_id;
    if not found then
      raise exception 'Referenced ticket does not exist for vault file.';
    end if;
    if new.owner_client_id is not null and new.owner_client_id is distinct from v_ticket_client then
      raise exception 'Vault file owner_client_id does not match ticket client_id.';
    end if;
    new.owner_client_id := coalesce(new.owner_client_id, v_ticket_client);
  end if;

  if new.bucket = 'private'
     and new.category in (
       'order_attachment',
       'requirement_attachment',
       'ticket_attachment',
       'payment_proof',
       'roe_document'
     )
     and new.owner_client_id is not null
     and exists (
       select 1 from public.profiles p
       where p.id = new.uploaded_by and p.role = 'client'::public.user_role
     )
  then
    if new.uploaded_by is distinct from new.owner_client_id then
      raise exception 'Client uploader must match vault file owner.';
    end if;
    if position(('private/' || new.owner_client_id::text || '/') in new.r2_key) <> 1 then
      raise exception 'Vault file r2_key prefix does not belong to uploading client.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_vault_file_tenant_integrity() from public, anon, authenticated;

-- 3. Canonical Consent Policy Registry & Inquiry Insert Enforcement
update public.consent_policies set is_active = false where is_active is true;

create unique index if not exists consent_policies_single_active_idx
  on public.consent_policies ((true))
  where is_active is true;

do $$
declare
  v_v1_canonical constant text :=
    '{"schema":1,"version":"v1","checkbox":"I have read the Data & Privacy Policy and Terms of Service and explicitly consent to the processing of my inquiry details and any uploaded scope attachments.","privacyNotice":"Your contact details and project summary are processed solely to evaluate your inquiry, prepare an engagement proposal, and communicate with you.","attachmentNotice":"Optional attachments are stored in an encrypted private vault with strict size, MIME, and retention controls.","policyText":"Data & Privacy Policy (v1): Inquiry submissions are processed exclusively by Md. Redwan Ahmed (redwan.work) for scoping, security review, and client communication. No inquiry data is sold or used for unsolicited marketing. You may request access or deletion at any time via contact@redwan.work."}';
  v_v2_canonical constant text :=
    '{"schema":1,"version":"v2","checkbox":"I have reviewed the Data & Privacy Policy and Terms of Service, and I explicitly consent to processing my inquiry details and any encrypted scope attachments.","privacyNotice":"We process your contact details and project brief strictly to review scope, check conflict/authorization boundaries, and respond to your request.","attachmentNotice":"Uploaded scope documents are isolated in our Encrypted Attachment Vault and governed by a 90-day unretained inquiry retention window.","policyText":"Data & Privacy Policy (v2): redwan.work processes inquiry data under explicit consent and pre-contractual scoping necessity. Submissions include salted IP rate-limit hashes, consent version/SHA-256 evidence, and optional encrypted attachments. Data is never shared with third-party advertisers. Contact contact@redwan.work for data access, export, or erasure."}';
begin
  if not exists (
    select 1 from public.inquiries where consent_policy_version = 'v1'
  ) then
    delete from public.consent_policies where version = 'v1';
    insert into public.consent_policies (version, canonical, hash, is_active)
    values (
      'v1',
      v_v1_canonical,
      encode(extensions.digest(convert_to(v_v1_canonical, 'UTF8'), 'sha256'), 'hex'),
      false
    );
  end if;

  insert into public.consent_policies (version, canonical, hash, is_active)
  values (
    'v2',
    v_v2_canonical,
    encode(extensions.digest(convert_to(v_v2_canonical, 'UTF8'), 'sha256'), 'hex'),
    true
  )
  on conflict (version) do update
    set canonical = excluded.canonical,
        hash = excluded.hash,
        is_active = true;
end;
$$;

create or replace function public.contact_consent_control(p_displayed_version text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active_version text;
  v_policies jsonb;
begin
  select cp.version
    into v_active_version
    from public.consent_policies cp
    where cp.is_active is true
    limit 1;

  if v_active_version is null then
    return jsonb_build_object(
      'schema', 1,
      'activeVersion', null,
      'policies', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'version', p.version,
        'canonical', p.canonical,
        'hash', p.hash
      )
      order by p.version
    ),
    '[]'::jsonb
  )
    into v_policies
    from public.consent_policies p
    where p.version = v_active_version
       or (
         p_displayed_version is not null
         and p.version = p_displayed_version
         and p.canonical like '{"schema":1,%'
       );

  return jsonb_build_object(
    'schema', 1,
    'activeVersion', v_active_version,
    'policies', v_policies
  );
end;
$$;

revoke all on function public.contact_consent_control(text) from public;
grant execute on function public.contact_consent_control(text) to anon, authenticated, service_role;

create or replace function public.enforce_inquiry_active_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active public.consent_policies;
begin
  select *
    into v_active
    from public.consent_policies
    where is_active is true
    limit 1;

  if not found then
    raise exception 'Consent policy is currently disabled.'
      using errcode = 'PT503';
  end if;

  if new.consent_policy_version is distinct from v_active.version
     or new.consent_policy_hash is distinct from v_active.hash
     or new.consent_capture_method is distinct from 'explicit-checkbox-v1'
     or new.consent_at is null
  then
    raise exception 'Current active consent policy evidence is required.'
      using errcode = 'PT409';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_inquiry_active_consent() from public, anon, authenticated;

drop trigger if exists inquiries_enforce_active_consent on public.inquiries;
create trigger inquiries_enforce_active_consent
  before insert on public.inquiries
  for each row execute function public.enforce_inquiry_active_consent();
