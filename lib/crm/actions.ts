'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  deletePrivateObjects,
  getPrivateObjectHeadBytes,
  isR2Configured,
  verifyStoredPortalObjectSize,
} from '@/lib/r2';
import {
  PORTAL_ALLOWED,
  extFromFilename,
  isAllowedMime,
  resolveMimeType,
  validateMagicBytes,
} from '@/lib/mime';
import {
  createInAppNotification,
  enqueueTransactionalEmail,
  notifyAllAdmins,
  recordAuditLog,
} from '@/lib/crm/audit';
import { type ServicePillarKey } from '@/lib/content/site';
import { getPublicServicesCatalog } from '@/lib/cms/queries';
import { parseFormBoolean } from '@/lib/forms/boolean';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { sanitizeHttpUrl } from '@/lib/security/safe-redirect';
import {
  currencySchema,
  positiveFiniteFxRateSchema,
} from '@/lib/validation/schemas';
import {
  computeDepositSplit,
  computeInvoiceTotals,
  validatePaymentSubmission,
} from '@/lib/finance/invariants';
import type { Database, Json } from '@/lib/supabase/database.types';

type OrderStatus = Database['public']['Enums']['order_status'];
type InquiryStatus = Database['public']['Enums']['inquiry_status'];
type ClientTier = Database['public']['Enums']['client_tier'];
type PaymentMethod = Database['public']['Enums']['payment_method'];
type TicketPriority = Database['public']['Enums']['ticket_priority'];
type TicketStatus = Database['public']['Enums']['ticket_status'];

const ALLOWED_ORDER_STATUSES = new Set<OrderStatus>([
  'awaiting_payment',
  'pending_requirements',
  'queued',
  'in_progress',
  'in_review',
  'revision_requested',
  'delivered',
  'completed',
  'on_hold',
  'cancelled',
]);

const ALLOWED_TICKET_STATUSES = new Set<TicketStatus>([
  'open',
  'in_progress',
  'awaiting_client',
  'answered',
  'resolved',
  'closed',
]);

const ALLOWED_PAYMENT_METHODS = new Set<PaymentMethod>([
  'bank_transfer',
  'wise',
  'payoneer',
  'bkash',
  'nagad',
  'paypal',
  'manual',
]);

async function requireAdminSession() {
  const session = await getCurrentSession();
  if (!session || session.role !== 'admin') {
    throw new Error('Admin authorization required.');
  }
  return session;
}

async function requireClientSession() {
  const session = await getCurrentSession();
  if (!session || session.role !== 'client') {
    throw new Error('Client account authorization required.');
  }
  return session;
}

async function requireAuthenticatedSession() {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error('Authentication required.');
  }
  return session;
}

async function lookupProfileEmail(userId: string): Promise<string | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    return typeof data?.email === 'string' && data.email.includes('@') ? data.email : null;
  } catch {
    return null;
  }
}

function getAdminAlertEmail(): string {
  return process.env.CONTACT_ALERT_TO || process.env.ADMIN_ALERT_EMAIL || 'contact@redwan.work';
}

function getSiteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://redwan.work';
}

async function enforceClientMutationRateLimit(userId: string): Promise<void> {
  try {
    const allowed = await consumeRateLimit('client-mutation', userId, 30, 60);
    if (!allowed) {
      throw new Error('Too many requests. Please wait a minute and try again.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Too many requests')) {
      throw err;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Rate control service is temporarily unavailable. Please retry shortly.');
    }
  }
}

async function registerVaultAttachmentFromForm(
  admin: ReturnType<typeof getSupabaseAdmin>,
  opts: {
    formData: FormData;
    ownerClientId: string;
    uploadedBy: string;
    category: 'order_attachment' | 'requirement_attachment' | 'ticket_attachment' | 'roe_document';
    orderId?: string | null;
    ticketId?: string | null;
    retentionDays?: number;
  }
): Promise<string | null> {
  const r2Key = String(opts.formData.get('r2_key') ?? '').trim();
  const filename = String(opts.formData.get('filename') ?? '').trim();
  const providedMime = String(opts.formData.get('mime') ?? '').trim();
  const sizeBytes = Number(opts.formData.get('size_bytes') ?? 0);
  const sha256Checksum = String(opts.formData.get('sha256_checksum') ?? '').trim() || null;

  if (!r2Key || !filename || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return null;
  }

  const ext = extFromFilename(filename);
  const resolvedMime = resolveMimeType(filename, providedMime);
  if (!ext || !isAllowedMime(ext, resolvedMime, PORTAL_ALLOWED)) {
    throw new Error('Unsupported attachment file type or MIME signature.');
  }

  const expectedPrefix = `private/${opts.ownerClientId}/${opts.category}/`;
  if (!r2Key.startsWith(expectedPrefix) || r2Key.includes('..')) {
    throw new Error('Invalid vault attachment storage prefix.');
  }
  if (isR2Configured()) {
    const okSize = await verifyStoredPortalObjectSize(r2Key, sizeBytes);
    if (!okSize) {
      throw new Error('Uploaded attachment could not be verified in private storage.');
    }
    const headBytes = await getPrivateObjectHeadBytes(r2Key, 64);
    if (!headBytes || !validateMagicBytes(headBytes, resolvedMime)) {
      throw new Error('Uploaded attachment signature does not match its declared file type.');
    }
  }

  const retentionDays = opts.retentionDays ?? 365;
  const retentionUntil = new Date(Date.now() + retentionDays * 86400 * 1000).toISOString();
  const { data: vFile, error: fileErr } = await admin
    .from('vault_files')
    .insert({
      owner_client_id: opts.ownerClientId,
      order_id: opts.orderId ?? null,
      ticket_id: opts.ticketId ?? null,
      category: opts.category,
      r2_key: r2Key,
      filename,
      mime_type: resolvedMime,
      size_bytes: Math.round(sizeBytes),
      sha256_checksum: sha256Checksum,
      retention_until: retentionUntil,
      uploaded_by: opts.uploadedBy,
    })
    .select('id')
    .single();
  if (fileErr || !vFile) {
    throw new Error(fileErr?.message ?? 'Could not register uploaded attachment.');
  }
  return vFile.id;
}

// =============================================================================
// 1. ADMIN: INQUIRY TRIAGE & CLIENT INVITATION / CONVERSION
// =============================================================================

const ALLOWED_INQUIRY_STATUSES = new Set<InquiryStatus>([
  'new',
  'reviewing',
  'proposal_sent',
  'converted',
  'archived',
]);

export async function updateInquiryStatusAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const inquiryId = String(formData.get('inquiry_id') ?? '').trim();
  const rawStatus = String(formData.get('status') ?? 'reviewing').trim();
  const status: InquiryStatus = ALLOWED_INQUIRY_STATUSES.has(rawStatus as InquiryStatus)
    ? (rawStatus as InquiryStatus)
    : 'reviewing';
  if (!inquiryId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('inquiries').update({ status }).eq('id', inquiryId);
  if (error) {
    throw new Error(error.message);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'inquiry.status_updated',
    entityType: 'inquiry',
    entityId: inquiryId,
    summary: `Updated inquiry status to ${status}`,
    metadata: { status },
  });

  revalidatePath('/admin/inquiries');
  revalidatePath('/admin');
}

export async function inviteOrProvisionClientAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const fullName = String(formData.get('full_name') ?? '').trim();
  const company = String(formData.get('company') ?? '').trim() || null;
  const tier = (String(formData.get('tier') ?? 'standard').trim() || 'standard') as ClientTier;
  const inquiryId = String(formData.get('inquiry_id') ?? '').trim() || null;

  if (!email) return;

  const admin = getSupabaseAdmin();

  // Check if profile already exists
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();

  let clientId = existingProfile?.id ?? null;
  const siteOrigin = getSiteOrigin();

  if (!clientId) {
    const inviteRes = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role: 'client' },
      redirectTo: `${siteOrigin}/invite/accept`,
    });

    if (inviteRes.error) {
      throw new Error(inviteRes.error.message);
    }

    if (inviteRes.data?.user?.id) {
      clientId = inviteRes.data.user.id;
      const { error: profErr } = await admin
        .from('profiles')
        .upsert({
          id: clientId,
          email,
          full_name: fullName || email,
          role: 'client',
          is_active: true,
        });
      if (profErr) throw new Error(profErr.message);

      const { error: cpErr } = await admin.from('client_profiles').upsert({
        user_id: clientId,
        company_name: company,
        tier,
        acquisition_source: inquiryId ? 'contact_inquiry' : 'direct_invite',
      });
      if (cpErr) throw new Error(cpErr.message);
    }
  } else {
    await enqueueTransactionalEmail({
      toEmail: email,
      template: 'client_portal_invitation',
      subject: 'Your redwan.work Client Portal Workspace Is Ready',
      payload: {
        message: `Hi ${fullName || email}, your Client Portal account on redwan.work has been updated. Sign in at ${siteOrigin}/login to access your proposals, orders, invoices, and encrypted deliverables vault.`,
        actionUrl: `${siteOrigin}/login`,
      },
      entityType: 'client',
      entityId: clientId,
    });
  }

  const { error: invErr } = await admin.from('client_invitations').insert({
    email,
    full_name: fullName || null,
    company,
    tier,
    invited_by: session.userId,
    accepted_user_id: clientId,
    status: 'pending',
  });
  if (invErr) {
    throw new Error(invErr.message);
  }

  if (inquiryId && clientId) {
    const { error: inqErr } = await admin
      .from('inquiries')
      .update({ status: 'converted', converted_client_id: clientId })
      .eq('id', inquiryId);
    if (inqErr) {
      throw new Error(inqErr.message);
    }
    try {
      await admin
        .from('inquiry_attachments')
        .update({ retained: true })
        .eq('inquiry_id', inquiryId);
    } catch {
      // ignore if attachment retention update is unsupported in mock
    }
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId,
    action: 'client.invited',
    entityType: 'client',
    entityId: clientId,
    summary: `Invited client ${fullName || email}`,
    metadata: { email, company, tier, inquiryId },
  });

  revalidatePath('/admin/clients');
  revalidatePath('/admin/inquiries');
  revalidatePath('/admin');
}

// =============================================================================
// 2. ADMIN: PROPOSALS & ORDERS
// =============================================================================

export async function createProposalAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const recipientEmail = String(formData.get('recipient_email') ?? '')
    .trim()
    .toLowerCase();
  const recipientName = String(formData.get('recipient_name') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const pillar = (String(formData.get('pillar') ?? 'cybersecurity').trim() ||
    'cybersecurity') as ServicePillarKey;
  const executiveSummary = String(formData.get('executive_summary') ?? '').trim();
  const scopeItemsRaw = String(formData.get('scope_items') ?? '').trim();
  const totalUsd = Number(formData.get('total_usd') ?? 0);
  const depositPercent = Number(formData.get('deposit_percent') ?? 50);
  const deliveryDays = Number(formData.get('estimated_delivery_days') ?? 7);
  const requiresRoe =
    parseFormBoolean(formData, 'requires_roe') || pillar === 'cybersecurity';
  const rawPropStatus = String(formData.get('proposal_status') ?? 'sent').trim();
  const proposalStatus = rawPropStatus === 'draft' ? 'draft' : 'sent';
  const milestonesJsonRaw = String(formData.get('milestones_json') ?? '').trim();
  let clientId = String(formData.get('client_id') ?? '').trim() || null;
  const inquiryId = String(formData.get('inquiry_id') ?? '').trim() || null;

  if (!recipientEmail || !recipientName || !title || !executiveSummary || totalUsd <= 0) {
    return;
  }

  const totalCents = Math.round(totalUsd * 100);
  const scopeItems = scopeItemsRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  interface DraftMilestoneInput {
    title: string;
    amount_usd: number;
    due_days_offset?: number;
  }
  let parsedCustomMilestones: Array<{ title: string; amount_cents: number; due_days_offset: number }> = [];
  if (milestonesJsonRaw) {
    try {
      const parsed = JSON.parse(milestonesJsonRaw) as DraftMilestoneInput[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsedCustomMilestones = parsed
          .map((m, idx) => ({
            title: String(m.title ?? '').trim() || `Milestone ${idx + 1}`,
            amount_cents: Math.max(0, Math.round(Number(m.amount_usd ?? 0) * 100)),
            due_days_offset: Math.max(1, Math.round(Number(m.due_days_offset ?? (idx + 1) * 7))),
          }))
          .filter((m) => m.amount_cents > 0);
      }
    } catch {
      throw new Error('Invalid custom milestone schedule JSON.');
    }
  }

  const admin = getSupabaseAdmin();
  if (!clientId) {
    const { data: matchedProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', recipientEmail)
      .maybeSingle();
    clientId = matchedProfile?.id ?? null;
  }
  if (!clientId) {
    try {
      const siteOrigin = getSiteOrigin();
      const inviteRes = await admin.auth.admin.inviteUserByEmail(recipientEmail, {
        data: { full_name: recipientName, role: 'client' },
        redirectTo: `${siteOrigin}/invite/accept`,
      });
      if (inviteRes.data?.user?.id) {
        clientId = inviteRes.data.user.id;
        await admin.from('profiles').upsert({
          id: clientId,
          email: recipientEmail,
          full_name: recipientName || recipientEmail,
          role: 'client',
          is_active: true,
        });
        await admin.from('client_profiles').upsert({
          user_id: clientId,
          tier: 'standard',
          acquisition_source: inquiryId ? 'contact_inquiry' : 'proposal_invite',
        });
      }
    } catch {
      // fall through to explicit check below
    }
  }
  if (!clientId) {
    throw new Error('Proposals must be linked to an invited or active Portal Client account.');
  }

  if (inquiryId) {
    try {
      await admin
        .from('inquiries')
        .update({ status: 'proposal_sent', converted_client_id: clientId })
        .eq('id', inquiryId);
      await admin
        .from('inquiry_attachments')
        .update({ retained: true })
        .eq('inquiry_id', inquiryId);
    } catch {
      // non-fatal
    }
  }
  const { data: proposal, error: propErr } = await admin
    .from('proposals')
    .insert({
      client_id: clientId,
      inquiry_id: inquiryId,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      title,
      pillar,
      pricing_model: 'fixed_package',
      scope_summary: executiveSummary,
      deliverables_summary: scopeItems.join('\n') || executiveSummary,
      estimated_days: Math.max(1, deliveryDays),
      revisions_included: 2,
      requires_roe: requiresRoe,
      currency: 'USD',
      subtotal_cents: totalCents,
      total_cents: totalCents,
      deposit_percent: Math.min(100, Math.max(0, depositPercent)),
      status: proposalStatus,
      valid_until: new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10),
      created_by: session.userId,
    })
    .select('id, code')
    .single();
  if (propErr || !proposal) {
    throw new Error(propErr?.message ?? 'Could not create proposal.');
  }

  // Custom milestones or default 2 milestones (Kickoff & Final Delivery)
  const boundedDepositPercent = Math.min(100, Math.max(0, Math.round(depositPercent)));
  const { depositCents, balanceCents } = computeDepositSplit(totalCents, boundedDepositPercent);
  const milestonesToInsert =
    parsedCustomMilestones.length > 0
      ? parsedCustomMilestones.map((m, index) => ({
          proposal_id: proposal.id,
          position: index,
          title: m.title,
          amount_cents: m.amount_cents,
          due_days_offset: m.due_days_offset,
        }))
      : [
          {
            proposal_id: proposal.id,
            position: 0,
            title: 'Phase 1: Kickoff, Architecture & Initial Execution',
            amount_cents: depositCents,
            due_days_offset: Math.max(1, Math.floor(deliveryDays / 2)),
          },
          {
            proposal_id: proposal.id,
            position: 1,
            title: 'Phase 2: Final Deliverables, Verification & Handover',
            amount_cents: balanceCents,
            due_days_offset: deliveryDays,
          },
        ];

  const { error: msErr } = await admin.from('proposal_milestones').insert(milestonesToInsert);
  if (msErr) {
    throw new Error(msErr.message);
  }

  if (proposal) {
    if (proposalStatus === 'sent') {
      if (clientId) {
        await createInAppNotification({
          recipientId: clientId,
          category: 'proposal',
          title: `New Proposal ${proposal.code ?? ''}: ${title}`,
          body: 'Review and accept your project proposal in the Client Portal.',
          href: `/portal/proposals/${proposal.id}`,
        });
      }

      await enqueueTransactionalEmail({
        toEmail: recipientEmail,
        template: 'proposal_sent',
        subject: `Proposal ${proposal.code ?? ''} — ${title}`,
        payload: {
          message: `Hi ${recipientName}, a new project proposal (${proposal.code ?? ''}: ${title}) for $${totalUsd.toLocaleString()} USD is ready for your review in the redwan.work Client Portal.`,
          actionUrl: `${getSiteOrigin()}/portal/proposals/${proposal.id}`,
        },
        entityType: 'proposal',
        entityId: proposal.id,
      });
    }

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'admin',
      clientId,
      action: proposalStatus === 'draft' ? 'proposal.draft_saved' : 'proposal.sent',
      entityType: 'proposal',
      entityId: proposal.id,
      summary: `${proposalStatus === 'draft' ? 'Saved draft' : 'Sent'} proposal ${proposal.code ?? ''} (${title}) for ${recipientEmail}`,
      metadata: { totalCents, pillar, status: proposalStatus },
    });
  }

  revalidatePath('/admin/proposals');
  revalidatePath('/admin/pipeline');
  revalidatePath('/portal/proposals');
}

export async function createOrderFromAdminAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const pillar = (String(formData.get('pillar') ?? 'cybersecurity').trim() ||
    'cybersecurity') as ServicePillarKey;
  const rawCurrency = String(formData.get('currency') ?? 'USD').trim().toUpperCase();
  const currency =
    rawCurrency === 'BDT' || rawCurrency === 'EUR' || rawCurrency === 'GBP' ? rawCurrency : 'USD';
  const totalUsd = Number(formData.get('total_usd') ?? 0);
  const depositPercent = Math.min(100, Math.max(0, Math.round(Number(formData.get('deposit_percent') ?? 50))));
  const requiresRoe = parseFormBoolean(formData, 'requires_roe') || pillar === 'cybersecurity';
  const dueDays = Math.max(1, Math.round(Number(formData.get('due_days') ?? 10)));

  if (!clientId || !title || !Number.isFinite(totalUsd) || totalUsd < 0) return;

  const totalCents = Math.round(totalUsd * 100);
  const admin = getSupabaseAdmin();

  const { data: rpcRes, error: rpcErr } = await admin.rpc('create_admin_order_atomic', {
    p_admin_id: session.userId,
    p_client_id: clientId,
    p_title: title,
    p_description: description,
    p_pillar: pillar,
    p_total_cents: totalCents,
    p_deposit_percent: depositPercent,
    p_requires_roe: requiresRoe,
    p_due_days: dueDays,
    p_currency: currency,
  });

  if (rpcErr) {
    throw new Error(rpcErr.message);
  }

  const parsed =
    rpcRes && typeof rpcRes === 'object' && !Array.isArray(rpcRes)
      ? (rpcRes as { order_id?: string; code?: string; status?: OrderStatus })
      : null;

  if (parsed?.order_id) {
    const orderCode = parsed.code ?? '';
    await createInAppNotification({
      recipientId: clientId,
      category: 'order',
      title: `New Order Created: ${orderCode}`,
      body: title,
      href: `/portal/orders/${parsed.order_id}`,
    });

    const clientEmail = await lookupProfileEmail(clientId);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'order_created',
        subject: `Order ${orderCode} Created — ${title}`,
        payload: {
          message: `A new engagement order (${orderCode}: ${title}) for ${currency} ${totalUsd.toLocaleString()} has been initialized in your Client Portal.`,
          actionUrl: `${getSiteOrigin()}/portal/orders/${parsed.order_id}`,
        },
        entityType: 'order',
        entityId: parsed.order_id,
      });
    }

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'admin',
      clientId,
      orderId: parsed.order_id,
      action: 'order.created',
      entityType: 'order',
      entityId: parsed.order_id,
      summary: `Created order ${orderCode}: ${title}`,
      metadata: { totalCents, pillar, initialStatus: parsed.status ?? 'awaiting_payment' },
    });
  }

  revalidatePath('/admin/orders');
  revalidatePath('/admin/invoices');
  revalidatePath('/portal/orders');
  revalidatePath('/portal/invoices');
}

export async function updateOrderStatusAndProgressAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const rawStatus = String(formData.get('status') ?? '').trim() as OrderStatus;
  const progressPercent = Number(formData.get('progress_percent') ?? 0);

  if (!orderId || !rawStatus) return;
  if (!ALLOWED_ORDER_STATUSES.has(rawStatus)) {
    throw new Error(`Invalid order status: ${rawStatus}`);
  }
  const status: OrderStatus = rawStatus;

  const admin = getSupabaseAdmin();
  if (status === 'completed') {
    const { data: unpaid } = await admin
      .from('invoices')
      .select('id')
      .eq('order_id', orderId)
      .not('status', 'in', '("paid","void")')
      .limit(1);
    if (unpaid && unpaid.length > 0) {
      throw new Error('Cannot mark order completed while unpaid invoices remain.');
    }
  }

  const { data: existing } = await admin
    .from('orders')
    .select('client_id, code, title')
    .eq('id', orderId)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    status,
    progress_percent: Math.min(100, Math.max(0, Math.round(progressPercent))),
  };
  if (status === 'in_progress') updates.started_at = new Date().toISOString();
  if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
    updates.progress_percent = 100;
  }

  const { error } = await admin.from('orders').update(updates).eq('id', orderId);
  if (error) {
    throw new Error(error.message);
  }

  if (existing) {
    await createInAppNotification({
      recipientId: existing.client_id,
      category: 'order',
      title: `Order ${existing.code} Updated`,
      body: `Status changed to ${status.replace(/_/g, ' ')} (${updates.progress_percent}%).`,
      href: `/portal/orders/${orderId}`,
    });

    const clientEmail = await lookupProfileEmail(existing.client_id);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'order_status_updated',
        subject: `Order ${existing.code} Status Updated — ${status.replace(/_/g, ' ')}`,
        payload: {
          message: `Your order ${existing.code} (${existing.title}) is now marked as ${status.replace(/_/g, ' ')} (${updates.progress_percent}% complete).`,
          actionUrl: `${getSiteOrigin()}/portal/orders/${orderId}`,
        },
        entityType: 'order',
        entityId: orderId,
      });
    }

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'admin',
      clientId: existing.client_id,
      orderId,
      action: 'order.status_updated',
      entityType: 'order',
      entityId: orderId,
      summary: `Order ${existing.code} -> ${status} (${updates.progress_percent}%)`,
      metadata: updates,
    });
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath('/portal/orders');
}

export async function addOrderTaskAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const isClientVisible = parseFormBoolean(formData, 'is_client_visible');

  if (!orderId || !title) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('order_tasks')
    .insert({
      order_id: orderId,
      title,
      is_client_visible: isClientVisible,
    });
  if (error) {
    throw new Error(error.message);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    orderId,
    action: 'order.task_added',
    entityType: 'order_task',
    summary: `Added order task "${title}"`,
    metadata: { isClientVisible },
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath('/contact');
}

export async function toggleOrderTaskAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const taskId = String(formData.get('task_id') ?? '').trim();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const completed = parseFormBoolean(formData, 'is_completed');

  if (!taskId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('order_tasks')
    .update({
      is_completed: completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', taskId);
  if (error) {
    throw new Error(error.message);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    orderId: orderId || null,
    action: 'order.task_toggled',
    entityType: 'order_task',
    entityId: taskId,
    summary: `Marked order task ${completed ? 'completed' : 'incomplete'}`,
    metadata: { is_completed: completed },
  });

  if (orderId) {
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/portal/orders/${orderId}`);
  }
}

export async function submitOrderDeliverableAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const versionLabel = String(formData.get('version_label') ?? 'v1.0').trim() || 'v1.0';
  const releaseNotes = String(formData.get('release_notes') ?? '').trim() || null;
  const isFinal = parseFormBoolean(formData, 'is_final_delivery');
  const r2Key = String(formData.get('r2_key') ?? '').trim();
  const filename = String(formData.get('filename') ?? '').trim();
  const mime = String(formData.get('mime') ?? 'application/pdf').trim();
  const sizeBytes = Number(formData.get('size_bytes') ?? 0);
  const sha256Checksum = String(formData.get('sha256_checksum') ?? '').trim() || null;

  if (!orderId || !clientId || !title) return;

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('code, pillar, auto_accept_days, client_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.client_id !== clientId) {
    throw new Error('Order does not match target client.');
  }

  let resolvedDeliverableMime = resolveMimeType(filename, mime);
  if (r2Key && filename && sizeBytes > 0) {
    const ext = extFromFilename(filename);
    resolvedDeliverableMime = resolveMimeType(filename, mime);
    if (!ext || !isAllowedMime(ext, resolvedDeliverableMime, PORTAL_ALLOWED)) {
      throw new Error('Unsupported deliverable file type or MIME signature.');
    }
    const expectedPrefix = `private/${clientId}/deliverable/`;
    if (!r2Key.startsWith(expectedPrefix) || r2Key.includes('..')) {
      throw new Error('Invalid deliverable storage key prefix.');
    }
    if (isR2Configured()) {
      const okSize = await verifyStoredPortalObjectSize(r2Key, sizeBytes);
      if (!okSize) {
        throw new Error('Uploaded deliverable object could not be verified in private storage.');
      }
      const headBytes = await getPrivateObjectHeadBytes(r2Key, 64);
      if (!headBytes || !validateMagicBytes(headBytes, resolvedDeliverableMime)) {
        throw new Error('Uploaded deliverable signature does not match its declared file type.');
      }
    }
  }

  const autoAcceptDays = order.auto_accept_days ?? 7;
  const autoAcceptAt = new Date(Date.now() + autoAcceptDays * 86400 * 1000).toISOString();

  const { data: deliverable, error: delivErr } = await admin
    .from('deliverables')
    .insert({
      order_id: orderId,
      version_label: versionLabel,
      title,
      release_notes: releaseNotes,
      is_final_delivery: isFinal,
      status: 'submitted',
      auto_accept_at: autoAcceptAt,
      submitted_by: session.userId,
    })
    .select('id, code')
    .single();
  if (delivErr || !deliverable) {
    throw new Error(delivErr?.message ?? 'Could not publish deliverable.');
  }

  let insertedVaultFileId: string | null = null;
  if (r2Key && filename && sizeBytes > 0) {
    const retentionDays = order.pillar === 'cybersecurity' ? 90 : 365;
    const retentionUntil = new Date(Date.now() + retentionDays * 86400 * 1000).toISOString();
    const { data: vFile, error: fileErr } = await admin
      .from('vault_files')
      .insert({
        owner_client_id: clientId,
        order_id: orderId,
        deliverable_id: deliverable.id,
        category: 'deliverable',
        r2_key: r2Key,
        filename,
        mime_type: resolvedDeliverableMime,
        size_bytes: sizeBytes,
        sha256_checksum: sha256Checksum,
        retention_until: retentionUntil,
        uploaded_by: session.userId,
      })
      .select('id')
      .single();
    if (fileErr || !vFile) {
      await admin.from('deliverables').delete().eq('id', deliverable.id);
      throw new Error(fileErr?.message ?? 'Could not register deliverable vault file.');
    }
    insertedVaultFileId = vFile.id;
  }

  const { error: ordUpdateErr } = await admin
    .from('orders')
    .update({
      status: isFinal ? 'delivered' : 'in_review',
      delivered_at: new Date().toISOString(),
      progress_percent: isFinal ? 95 : 80,
    })
    .eq('id', orderId);
  if (ordUpdateErr) {
    if (insertedVaultFileId) {
      await admin.from('vault_files').delete().eq('id', insertedVaultFileId);
    }
    await admin.from('deliverables').delete().eq('id', deliverable.id);
    throw new Error(ordUpdateErr.message);
  }

  await createInAppNotification({
    recipientId: clientId,
    category: 'deliverable',
    title: `Deliverable Ready (${versionLabel}): ${title}`,
    body: 'Review and download your deliverable package in the Client Portal.',
    href: `/portal/orders/${orderId}`,
  });

  const clientEmail = await lookupProfileEmail(clientId);
  if (clientEmail) {
    await enqueueTransactionalEmail({
      toEmail: clientEmail,
      template: 'deliverable_published',
      subject: `Deliverable ${deliverable?.code ?? ''} (${versionLabel}) Ready — ${title}`,
      payload: {
        message: `A new versioned deliverable (${versionLabel}: ${title}) has been published to your Encrypted Deliverables Vault for order ${order.code}.`,
        actionUrl: `${getSiteOrigin()}/portal/orders/${orderId}`,
      },
      entityType: 'deliverable',
      entityId: deliverable?.id,
    });
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId,
    orderId,
    action: 'deliverable.submitted',
    entityType: 'deliverable',
    entityId: deliverable?.id,
    summary: `Published deliverable ${deliverable?.code ?? ''} (${versionLabel}: ${title})`,
    metadata: { versionLabel, filename, isFinal },
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath('/portal/files');
}

// =============================================================================
// 3. ADMIN: INVOICES, PAYMENTS, CLIENT CRM & TICKETS
// =============================================================================

export async function createAndIssueInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const orderId = String(formData.get('order_id') ?? '').trim() || null;
  const parsedCurrency = currencySchema.safeParse(formData.get('currency') ?? 'USD');
  const currency = parsedCurrency.success ? parsedCurrency.data : 'USD';
  const rawFxInput = formData.get('fx_rate_to_usd');
  const parsedFx =
    rawFxInput !== null && String(rawFxInput).trim() !== ''
      ? positiveFiniteFxRateSchema.safeParse(Number(rawFxInput))
      : { success: true as const, data: 1 };
  if (!parsedFx.success) {
    throw new Error('FX rate to USD must be a positive finite number.');
  }
  const fxRate = parsedFx.data;
  const description = String(formData.get('description') ?? '').trim();
  const amountMajor = Number(formData.get('amount_major') ?? 0);
  const discountMajor = Number(formData.get('discount_major') ?? 0);
  const taxRateBps = Math.round(Number(formData.get('tax_rate_bps') ?? 0));
  const dueDays = Math.max(1, Math.round(Number(formData.get('due_days') ?? 7)));
  const notes = String(formData.get('notes') ?? '').trim() || null;
  const isDeposit = parseFormBoolean(formData, 'is_deposit_invoice');

  if (!clientId || !description || !Number.isFinite(amountMajor) || amountMajor <= 0 || !Number.isFinite(discountMajor)) return;

  const subtotalCents = Math.round(amountMajor * 100);
  const discountCents = Math.max(0, Math.round(discountMajor * 100));
  const totals = computeInvoiceTotals({
    subtotalCents,
    discountCents,
    taxRateBps,
  });

  const admin = getSupabaseAdmin();
  const { data: rpcRes, error: invErr } = await admin.rpc('issue_invoice_atomic', {
    p_client_id: clientId,
    p_order_id: orderId,
    p_is_deposit: isDeposit,
    p_currency: currency,
    p_fx_rate_to_usd: fxRate,
    p_subtotal_cents: totals.subtotalCents,
    p_discount_cents: totals.discountCents,
    p_tax_rate_bps: totals.taxRateBps,
    p_due_days: dueDays,
    p_notes: notes,
    p_item_description: description,
  });

  if (invErr) {
    throw new Error(invErr.message);
  }

  const invoice =
    rpcRes && typeof rpcRes === 'object' && !Array.isArray(rpcRes)
      ? (rpcRes as { invoice_id?: string; code?: string; total_cents?: number })
      : null;

  if (invoice?.invoice_id) {
    const displayMajor = (totals.totalCents / 100).toLocaleString();
    await createInAppNotification({
      recipientId: clientId,
      category: 'invoice',
      title: `Invoice Issued: ${invoice.code ?? ''}`,
      body: `${description} (${currency} ${displayMajor})`,
      href: `/portal/invoices/${invoice.invoice_id}`,
    });

    const clientEmail = await lookupProfileEmail(clientId);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'invoice_issued',
        subject: `Invoice ${invoice.code ?? ''} Issued (${currency} ${displayMajor})`,
        payload: {
          message: `A new invoice (${invoice.code ?? ''}: ${description}) for ${currency} ${displayMajor} has been issued in your Client Portal.`,
          actionUrl: `${getSiteOrigin()}/portal/invoices/${invoice.invoice_id}`,
        },
        entityType: 'invoice',
        entityId: invoice.invoice_id,
      });
    }

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'admin',
      clientId,
      orderId,
      action: 'invoice.issued',
      entityType: 'invoice',
      entityId: invoice.invoice_id,
      summary: `Issued invoice ${invoice.code ?? ''} for ${currency} ${displayMajor}`,
      metadata: { currency, totalCents: totals.totalCents, fxRate },
    });
  }

  revalidatePath('/admin/invoices');
  revalidatePath('/admin/billing');
  revalidatePath('/portal/invoices');
}

export async function reviewPaymentProofAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const paymentId = String(formData.get('payment_id') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  const rawFxStr = String(formData.get('fx_rate') ?? '').trim();
  const parsedFx = rawFxStr ? Number(rawFxStr) : NaN;
  const fxRate = Number.isFinite(parsedFx) && parsedFx > 0 ? parsedFx : undefined;
  const reason = String(formData.get('reason') ?? '').trim() || null;

  if (!paymentId || (decision !== 'confirmed' && decision !== 'rejected')) return;

  const admin = getSupabaseAdmin();
  let paymentMeta: {
    client_id: string;
    invoice_id: string;
    order_id: string | null;
    code: string;
    amount_cents: number;
    currency: string;
  } | null = null;
  try {
    const { data } = await admin
      .from('payments')
      .select('client_id, invoice_id, order_id, code, amount_cents, currency')
      .eq('id', paymentId)
      .maybeSingle();
    if (data) paymentMeta = data;
  } catch {
    // ignore in minimal unit test mocks
  }

  const { error } = await admin.rpc('review_invoice_payment', {
    p_payment_id: paymentId,
    p_admin_id: session.userId,
    p_decision: decision,
    p_fx_rate: fxRate,
    p_reason: reason ?? undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (paymentMeta?.client_id) {
    await createInAppNotification({
      recipientId: paymentMeta.client_id,
      category: 'payment',
      title:
        decision === 'confirmed'
          ? `Payment ${paymentMeta.code} Confirmed`
          : `Payment ${paymentMeta.code} Needs Attention`,
      body:
        decision === 'confirmed'
          ? `Your payment of ${paymentMeta.currency} ${(paymentMeta.amount_cents / 100).toLocaleString()} has been verified.`
          : (reason ?? 'Your submitted payment proof could not be verified.'),
      href: `/portal/invoices/${paymentMeta.invoice_id}`,
    });

    const clientEmail = await lookupProfileEmail(paymentMeta.client_id);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: `payment_${decision}`,
        subject:
          decision === 'confirmed'
            ? `Payment Confirmed (${paymentMeta.code})`
            : `Update Regarding Payment ${paymentMeta.code}`,
        payload: {
          message:
            decision === 'confirmed'
              ? `Your payment transfer ${paymentMeta.code} (${paymentMeta.currency} ${(paymentMeta.amount_cents / 100).toLocaleString()}) has been verified and applied to your invoice.`
              : `Your payment transfer ${paymentMeta.code} could not be verified: ${reason ?? 'Please check your transaction reference or receipt.'}`,
          actionUrl: `${getSiteOrigin()}/portal/invoices/${paymentMeta.invoice_id}`,
        },
        entityType: 'payment',
        entityId: paymentId,
      });
    }
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId: paymentMeta?.client_id ?? null,
    orderId: paymentMeta?.order_id ?? null,
    action: `payment.${decision}`,
    entityType: 'payment',
    entityId: paymentId,
    summary: `Reviewed payment ${paymentMeta?.code ?? paymentId}: ${decision}`,
    metadata: { decision, fxRate, reason },
  });

  if (paymentMeta?.invoice_id) {
    revalidatePath(`/admin/invoices/${paymentMeta.invoice_id}`);
    revalidatePath(`/portal/invoices/${paymentMeta.invoice_id}`);
  }
  revalidatePath('/admin/invoices');
  revalidatePath('/admin/billing');
  revalidatePath('/admin');
  revalidatePath('/portal/invoices');
  revalidatePath('/portal/orders');
}

export async function updateClientCrmAndNoteAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const tier = (String(formData.get('tier') ?? 'standard').trim() || 'standard') as ClientTier;
  const companyName = String(formData.get('company_name') ?? '').trim() || null;
  const relationshipSummary = String(formData.get('relationship_summary') ?? '').trim() || null;
  const nextFollowupRaw = String(formData.get('next_followup_at') ?? '').trim();
  const noteBody = String(formData.get('note_body') ?? '').trim();

  if (!clientId) return;

  const admin = getSupabaseAdmin();
  const { error: cpErr } = await admin.from('client_profiles').upsert({
    user_id: clientId,
    tier,
    company_name: companyName,
    relationship_summary: relationshipSummary,
    next_followup_at: nextFollowupRaw ? new Date(nextFollowupRaw).toISOString() : null,
  });
  if (cpErr) throw new Error(cpErr.message);

  if (noteBody) {
    const { error: noteErr } = await admin.from('client_notes').insert({
      client_id: clientId,
      author_id: session.userId,
      body: noteBody,
      note_type: 'general',
    });
    if (noteErr) throw new Error(noteErr.message);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId,
    action: 'client.crm_updated',
    entityType: 'client',
    entityId: clientId,
    summary: `Updated CRM tier (${tier}) and retention profile for client`,
    metadata: { tier, companyName, hasNewNote: Boolean(noteBody) },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath('/admin/clients');
}

export async function toggleClientActiveStatusAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const nextActive = parseFormBoolean(formData, 'is_active');
  if (!clientId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('profiles')
    .update({ is_active: nextActive })
    .eq('id', clientId)
    .eq('role', 'client');
  if (error) throw new Error(error.message);

  if (!nextActive) {
    try {
      const authAdmin = admin.auth?.admin as { signOut?: (jwtOrUid: string) => Promise<unknown> } | undefined;
      if (typeof authAdmin?.signOut === 'function') {
        await authAdmin.signOut(clientId).catch(() => undefined);
      }
    } catch {
      // Non-fatal if signOut admin API is unavailable
    }

    const clientEmail = await lookupProfileEmail(clientId);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'account_deactivated',
        subject: 'Your redwan.work Client Portal Account Was Deactivated',
        payload: {
          message:
            'Your Client Portal access has been deactivated by an administrator. If you believe this was in error or need access restored, please contact support.',
          actionUrl: `${getSiteOrigin()}/contact`,
        },
        entityType: 'client',
        entityId: clientId,
      });
    }
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId,
    action: nextActive ? 'client.activated' : 'client.deactivated',
    entityType: 'client',
    entityId: clientId,
    summary: `${nextActive ? 'Reactivated' : 'Deactivated'} client account`,
    metadata: { is_active: nextActive },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath('/admin/clients');
}

export async function replyTicketAction(formData: FormData): Promise<void> {
  const session = await requireAuthenticatedSession();
  const ticketId = String(formData.get('ticket_id') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const isInternalNote =
    session.role === 'admin' && parseFormBoolean(formData, 'is_internal_note');

  if (!ticketId || !body) return;

  if (session.role !== 'admin') {
    await enforceClientMutationRateLimit(session.userId);
  }

  const admin = getSupabaseAdmin();
  const { data: ticket } = await admin
    .from('tickets')
    .select('client_id, code, subject, status')
    .eq('id', ticketId)
    .maybeSingle();

  if (!ticket) return;
  if (session.role !== 'admin' && ticket.client_id !== session.userId) {
    throw new Error('Forbidden.');
  }
  if (session.role !== 'admin' && ticket.status === 'closed') {
    throw new Error('Closed tickets cannot receive new client replies. Please open a new support ticket.');
  }

  const fileId = await registerVaultAttachmentFromForm(admin, {
    formData,
    ownerClientId: ticket.client_id,
    uploadedBy: session.userId,
    category: 'ticket_attachment',
    ticketId,
  });

  const { error: msgErr } = await admin.from('ticket_messages').insert({
    ticket_id: ticketId,
    author_id: session.userId,
    body,
    is_internal_note: isInternalNote,
    attachment_file_ids: fileId ? [fileId] : [],
  });
  if (msgErr) throw new Error(msgErr.message);

  if (!isInternalNote) {
    if (session.role === 'admin') {
      try {
        await admin.from('tickets').update({ status: 'answered' }).eq('id', ticketId);
      } catch {}
      await createInAppNotification({
        recipientId: ticket.client_id,
        category: 'ticket',
        title: `Support Reply on ${ticket.code}`,
        body: body.slice(0, 120),
        href: `/portal/tickets/${ticketId}`,
      });
      const clientEmail = await lookupProfileEmail(ticket.client_id);
      if (clientEmail) {
        await enqueueTransactionalEmail({
          toEmail: clientEmail,
          template: 'ticket_reply',
          subject: `Re: [${ticket.code}] ${ticket.subject}`,
          payload: {
            message: body.slice(0, 400),
            actionUrl: `${getSiteOrigin()}/portal/tickets/${ticketId}`,
          },
          entityType: 'ticket',
          entityId: ticketId,
        });
      }
    } else {
      try {
        await admin
          .from('tickets')
          .update({ status: 'open', resolved_at: null })
          .eq('id', ticketId);
      } catch {}
      await notifyAllAdmins({
        category: 'ticket',
        title: `Client Reply on Ticket ${ticket.code}`,
        body: body.slice(0, 120),
        href: `/admin/tickets/${ticketId}`,
      });
      await enqueueTransactionalEmail({
        toEmail: getAdminAlertEmail(),
        template: 'ticket_reply_admin',
        subject: `Client Reply on [${ticket.code}] ${ticket.subject}`,
        payload: {
          message: body.slice(0, 400),
          actionUrl: `${getSiteOrigin()}/admin/tickets/${ticketId}`,
        },
        entityType: 'ticket',
        entityId: ticketId,
      });
    }
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: session.role === 'admin' ? 'admin' : 'client',
    clientId: ticket.client_id,
    action: 'ticket.replied',
    entityType: 'ticket',
    entityId: ticketId,
    summary: `Posted reply on ticket ${ticket.code}`,
    metadata: { isInternalNote },
  });

  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath('/admin/tickets');
  revalidatePath(`/portal/tickets/${ticketId}`);
  revalidatePath('/portal/tickets');
}

export async function updateTicketStatusAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const ticketId = String(formData.get('ticket_id') ?? '').trim();
  const rawStatus = String(formData.get('status') ?? 'resolved').trim() as TicketStatus;
  if (!ticketId) return;
  if (!ALLOWED_TICKET_STATUSES.has(rawStatus)) {
    throw new Error(`Invalid ticket status: ${rawStatus}`);
  }
  const status: TicketStatus = rawStatus;

  const admin = getSupabaseAdmin();
  let ticketMeta: { client_id: string; code: string; subject: string } | null = null;
  try {
    const { data } = await admin
      .from('tickets')
      .select('client_id, code, subject')
      .eq('id', ticketId)
      .maybeSingle();
    if (data) ticketMeta = data;
  } catch {}

  const { error } = await admin
    .from('tickets')
    .update({
      status,
      resolved_at: status === 'resolved' || status === 'closed' ? new Date().toISOString() : null,
    })
    .eq('id', ticketId);
  if (error) throw new Error(error.message);

  if (ticketMeta?.client_id) {
    await createInAppNotification({
      recipientId: ticketMeta.client_id,
      category: 'ticket',
      title: `Ticket ${ticketMeta.code} Marked ${status.replace(/_/g, ' ')}`,
      body: ticketMeta.subject,
      href: `/portal/tickets/${ticketId}`,
    });
    const clientEmail = await lookupProfileEmail(ticketMeta.client_id);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'ticket_status_updated',
        subject: `Ticket ${ticketMeta.code} Status: ${status.replace(/_/g, ' ')}`,
        payload: {
          message: `Your support ticket ${ticketMeta.code} (${ticketMeta.subject}) is now marked as ${status.replace(/_/g, ' ')}.`,
          actionUrl: `${getSiteOrigin()}/portal/tickets/${ticketId}`,
        },
        entityType: 'ticket',
        entityId: ticketId,
      });
    }
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId: ticketMeta?.client_id ?? null,
    action: 'ticket.status_updated',
    entityType: 'ticket',
    entityId: ticketId,
    summary: `Updated ticket ${ticketMeta?.code ?? ticketId} status to ${status}`,
    metadata: { status },
  });

  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath('/admin/tickets');
  revalidatePath(`/portal/tickets/${ticketId}`);
}

export async function toggleReviewPublicApprovalAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const reviewId = String(formData.get('review_id') ?? '').trim();
  const approved = parseFormBoolean(formData, 'is_public_approved');
  if (!reviewId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('client_reviews')
    .update({ is_public_approved: approved })
    .eq('id', reviewId);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'review.public_approval_toggled',
    entityType: 'review',
    entityId: reviewId,
    summary: `${approved ? 'Approved' : 'Unpublished'} client review for public display`,
    metadata: { is_public_approved: approved },
  });

  revalidatePath('/admin/reviews');
  revalidatePath('/');
  revalidatePath('/services');
}

export async function createRetainerPlanAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const pillar = (String(formData.get('pillar') ?? 'tech_support').trim() ||
    'tech_support') as ServicePillarKey;
  const monthlyUsd = Number(formData.get('monthly_usd') ?? 750);
  const hoursIncluded = Number(formData.get('hours_included') ?? 10);

  if (!clientId || !title) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('retainer_plans').insert({
    client_id: clientId,
    title,
    pillar,
    monthly_fee_cents: Math.round(monthlyUsd * 100),
    currency: 'USD',
    hours_per_month: hoursIncluded,
    hours_used_current_period: 0,
    status: 'active',
  });
  if (error) throw new Error(error.message);

  await createInAppNotification({
    recipientId: clientId,
    category: 'retainer',
    title: `Monthly Retainer Activated: ${title}`,
    body: `${hoursIncluded} hrs/month (${monthlyUsd.toLocaleString()} USD/mo)`,
    href: '/portal/retainers',
  });

  const clientEmail = await lookupProfileEmail(clientId);
  if (clientEmail) {
    await enqueueTransactionalEmail({
      toEmail: clientEmail,
      template: 'retainer_activated',
      subject: `Monthly Retainer Activated — ${title}`,
      payload: {
        message: `Your monthly retainer plan (${title}: ${hoursIncluded} hrs/month at $${monthlyUsd.toLocaleString()} USD/mo) is now active in your Client Portal.`,
        actionUrl: `${getSiteOrigin()}/portal/retainers`,
      },
      entityType: 'retainer',
    });
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId,
    action: 'retainer.created',
    entityType: 'retainer',
    summary: `Started monthly retainer (${title}) for client`,
    metadata: { monthlyUsd, hoursIncluded },
  });

  revalidatePath('/admin/retainers');
  revalidatePath('/portal/retainers');
}

export async function updateRetainerPlanAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const retainerId = String(formData.get('retainer_id') ?? '').trim();
  const hoursUsed = Math.max(0, Number(formData.get('hours_used_current_period') ?? 0));
  const rawStatus = String(formData.get('status') ?? 'active').trim();
  const status =
    rawStatus === 'paused' || rawStatus === 'cancelled' ? rawStatus : 'active';

  if (!retainerId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('retainer_plans')
    .update({
      hours_used_current_period: hoursUsed,
      status,
    })
    .eq('id', retainerId);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'retainer.updated',
    entityType: 'retainer',
    entityId: retainerId,
    summary: `Updated retainer status (${status}) and hours used (${hoursUsed})`,
    metadata: { status, hoursUsed },
  });

  revalidatePath('/admin/retainers');
  revalidatePath('/portal/retainers');
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await requireAuthenticatedSession();
  const admin = getSupabaseAdmin();
  await admin
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_id', session.userId)
    .eq('is_read', false);

  revalidatePath('/admin', 'layout');
  revalidatePath('/portal', 'layout');
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const session = await requireAuthenticatedSession();
  const notificationId = String(formData.get('notification_id') ?? '').trim();
  if (!notificationId) return;

  const admin = getSupabaseAdmin();
  await admin
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_id', session.userId)
    .eq('is_read', false);

  revalidatePath('/admin', 'layout');
  revalidatePath('/portal', 'layout');
}

// =============================================================================
// 4. CLIENT PORTAL ACTIONS (ORDER PLACEMENT, ROE, DELIVERABLE SIGN-OFF, BILLING)
// =============================================================================

export async function acceptProposalClientAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const proposalId = String(formData.get('proposal_id') ?? '').trim();
  if (!proposalId) return;

  const admin = getSupabaseAdmin();
  const { data: rpcResult, error } = await admin.rpc('accept_proposal_and_create_order', {
    p_proposal_id: proposalId,
    p_actor_id: session.userId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/portal/proposals');
  revalidatePath('/portal/orders');
  revalidatePath('/admin/proposals');
  revalidatePath('/admin/orders');

  const resolvedOrderId =
    typeof rpcResult === 'string'
      ? rpcResult
      : rpcResult && typeof rpcResult === 'object' && !Array.isArray(rpcResult)
        ? (rpcResult as { order_id?: unknown }).order_id
        : null;

  await notifyAllAdmins({
    category: 'proposal',
    title: 'Proposal Accepted by Client',
    body: `${session.email} accepted proposal ${proposalId}.`,
    href:
      typeof resolvedOrderId === 'string' && resolvedOrderId
        ? `/admin/orders/${resolvedOrderId}`
        : '/admin/proposals',
  });

  await enqueueTransactionalEmail({
    toEmail: getAdminAlertEmail(),
    template: 'proposal_accepted_admin',
    subject: `Proposal Accepted by ${session.email}`,
    payload: {
      message: `${session.email} accepted proposal ${proposalId} and initialized order ${resolvedOrderId ?? ''}.`,
      actionUrl: `${getSiteOrigin()}/admin/orders`,
    },
    entityType: 'proposal',
    entityId: proposalId,
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    orderId: typeof resolvedOrderId === 'string' ? resolvedOrderId : null,
    action: 'proposal.accepted',
    entityType: 'proposal',
    entityId: proposalId,
    summary: `Client accepted proposal ${proposalId}`,
  });

  if (typeof resolvedOrderId === 'string' && resolvedOrderId) {
    redirect(`/portal/orders/${resolvedOrderId}`);
  }
}

export async function placePortalPackageOrderAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const serviceSlug = String(formData.get('service_slug') ?? '').trim();
  const tier = String(formData.get('tier') ?? 'standard').trim().toLowerCase();
  const projectTitle = String(formData.get('title') ?? '').trim();
  const projectNotes = String(formData.get('description') ?? '').trim();
  const targetScope = String(formData.get('target_scope_notes') ?? '').trim();
  const customBudgetUsd = Number(formData.get('custom_budget_usd') ?? 0);
  const customDeliveryDays = Number(formData.get('custom_delivery_days') ?? 7);

  const catalog = await getPublicServicesCatalog();
  const isOtherCustomService = serviceSlug === 'other-custom-engagement';
  const matchedService = isOtherCustomService
    ? undefined
    : (catalog.find((s) => s.slug === serviceSlug) ?? catalog[0]);

  const isUnselectedOrCustomTier = tier === 'custom' || tier === 'unselected';
  const hasCustomBudget = Number.isFinite(customBudgetUsd) && customBudgetUsd > 0;
  const isCustomDeal = isOtherCustomService || isUnselectedOrCustomTier || hasCustomBudget;
  const pkg =
    matchedService && !isUnselectedOrCustomTier
      ? (matchedService.packages.find((p) => p.tier === tier) ?? matchedService.packages[0])
      : undefined;

  const baseTitle = isOtherCustomService
    ? 'Custom Technical Engagement'
    : (matchedService?.title ?? 'Custom Technical Engagement');
  const baseTagline = isOtherCustomService
    ? 'Custom cybersecurity, full-stack engineering, or technical advisory engagement.'
    : (matchedService?.tagline ?? 'Custom technical engagement');
  const baseStartingCents = matchedService?.startingPriceCents ?? 25000;
  const effectiveServiceId =
    !isOtherCustomService && matchedService && matchedService.id.length === 36
      ? matchedService.id
      : null;
  const effectivePillar = isOtherCustomService
    ? 'development'
    : (matchedService?.pillar ?? 'development');
  const effectiveRequiresRoe =
    effectivePillar === 'cybersecurity' ||
    (!isOtherCustomService && Boolean(matchedService?.requiresRoe));

  const finalPriceCents = hasCustomBudget
    ? Math.max(2500, Math.round(customBudgetUsd * 100))
    : isOtherCustomService || isUnselectedOrCustomTier
      ? Math.max(2500, baseStartingCents)
      : (pkg?.priceCents ?? baseStartingCents);

  const finalDeliveryDays =
    Number.isFinite(customDeliveryDays) && customDeliveryDays > 0 && isCustomDeal
      ? Math.max(1, Math.round(customDeliveryDays))
      : (pkg?.deliveryDays ?? 7);

  const depositPercent = pkg?.depositPercent ?? 50;
  const revisionsIncluded = pkg?.revisions ?? 2;

  const finalTitle =
    projectTitle ||
    (pkg && hasCustomBudget
      ? `${baseTitle} — ${pkg.name} (Custom Offer $${(finalPriceCents / 100).toLocaleString()})`
      : isOtherCustomService || isUnselectedOrCustomTier
        ? `${baseTitle} — Custom Scope & Requirements ($${(finalPriceCents / 100).toLocaleString()})`
        : `${baseTitle} — ${pkg?.name ?? 'Standard Package'}`);

  const admin = getSupabaseAdmin();

  if (isCustomDeal) {
    if (!parseFormBoolean(formData, 'consent_accepted')) {
      throw new Error(
        'Please accept the Data & Privacy Policy consent checkbox before submitting a custom quote request.'
      );
    }
    if (hasCustomBudget && customBudgetUsd < 25) {
      throw new Error('Custom quote budgets must be at least USD 25.');
    }

    const { data: consentControlRaw, error: consentCtrlErr } = await admin.rpc(
      'contact_consent_control'
    );
    const consentObj =
      consentControlRaw && typeof consentControlRaw === 'object' && !Array.isArray(consentControlRaw)
        ? (consentControlRaw as {
            activeVersion?: string;
            policies?: Array<{ version?: string; hash?: string }>;
          })
        : null;
    const activeConsentVersion = consentObj?.activeVersion?.trim() || '';
    const activeConsentPolicy = (consentObj?.policies ?? []).find(
      (p) => p?.version === activeConsentVersion
    );
    if (consentCtrlErr || !activeConsentVersion || !activeConsentPolicy?.hash) {
      throw new Error('Could not verify active privacy consent policy. Please retry shortly.');
    }

    const { data: inquiry, error: inqErr } = await admin
      .from('inquiries')
      .insert({
        name: session.fullName || session.email,
        email: session.email,
        service_pillar: effectivePillar,
        services: [baseTitle],
        project_summary: `${finalTitle}\n\n${projectNotes || targetScope || baseTagline}`,
        is_custom_deal: true,
        proposed_budget_cents: finalPriceCents,
        proposed_delivery_days: finalDeliveryDays,
        selected_service_slug: isOtherCustomService
          ? 'other-custom-engagement'
          : (matchedService?.slug ?? serviceSlug),
        selected_package_tier: 'Custom',
        converted_client_id: session.userId,
        consent_policy_version: activeConsentVersion,
        consent_policy_hash: activeConsentPolicy.hash,
        consent_capture_method: 'explicit-checkbox-v1',
        consent_at: new Date().toISOString(),
        status: 'new',
      })
      .select('id, code')
      .single();

    if (inqErr || !inquiry) {
      throw new Error(inqErr?.message ?? 'Could not submit custom quote request.');
    }

    await notifyAllAdmins({
      category: 'inquiry',
      title: `Custom Quote Request ${inquiry.code}`,
      body: `${session.fullName || session.email} requested a custom proposal for "${finalTitle}" ($${(finalPriceCents / 100).toLocaleString()} USD).`,
      href: `/admin/inquiries`,
    });

    await enqueueTransactionalEmail({
      toEmail: session.email,
      template: 'custom_quote_submitted',
      subject: `Custom Quote Request ${inquiry.code} Received`,
      payload: {
        message: `Your custom quote request (${inquiry.code}: ${finalTitle}) has been queued for administrator scoping and proposal issuance.`,
        actionUrl: `${getSiteOrigin()}/portal/proposals`,
      },
      entityType: 'inquiry',
      entityId: inquiry.id,
    });

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'client',
      clientId: session.userId,
      action: 'inquiry.custom_quote_submitted',
      entityType: 'inquiry',
      entityId: inquiry.id,
      summary: `Submitted custom quote request ${inquiry.code}: ${finalTitle}`,
      metadata: {
        priceCents: finalPriceCents,
        deliveryDays: finalDeliveryDays,
      },
    });

    revalidatePath('/admin/inquiries');
    revalidatePath('/portal/orders/new');
    revalidatePath('/portal/proposals');
    redirect('/portal/orders/new?quote_submitted=1');
  }

  const milestoneFeatures =
    pkg && pkg.features.length > 0
      ? pkg.features
      : [
          'Scope & Architecture Alignment',
          'Core Execution & Implementation',
          'Verification & Final Delivery Sign-Off',
        ];

  const initialMessageTemplate = isCustomDeal
    ? `Started Custom Deal Contract ({{ORDER_CODE}}) with proposed budget $${(finalPriceCents / 100).toLocaleString()} USD and ${finalDeliveryDays}-day timeline.\n\nScope: ${projectNotes || targetScope || finalTitle}`
    : `Started Package Contract ({{ORDER_CODE}}): ${finalTitle}.\n\nScope: ${projectNotes || targetScope || pkg?.summary || baseTagline}`;

  const depositItemLabel = `${isCustomDeal ? 'Custom Deal' : (pkg?.name ?? 'Package')} (${depositPercent}% Kickoff Deposit)`;

  const { data: rpcRes, error } = await admin.rpc('create_package_order_atomic', {
    p_client_id: session.userId,
    p_service_id: effectiveServiceId,
    p_title: finalTitle,
    p_description: projectNotes || pkg?.summary || baseTagline,
    p_pillar: effectivePillar,
    p_is_custom_deal: isCustomDeal,
    p_requires_roe: effectiveRequiresRoe,
    p_revisions_included: revisionsIncluded,
    p_total_cents: finalPriceCents,
    p_deposit_percent: depositPercent,
    p_delivery_days: finalDeliveryDays,
    p_target_scope_notes: targetScope || projectNotes,
    p_requirements_responses: {
      service_slug: isOtherCustomService
        ? 'other-custom-engagement'
        : (matchedService?.slug ?? serviceSlug),
      package_tier: isCustomDeal ? 'custom' : (pkg?.tier ?? tier),
      is_custom_deal: isCustomDeal,
      proposed_budget_cents: isCustomDeal ? finalPriceCents : null,
      proposed_delivery_days: isCustomDeal ? finalDeliveryDays : null,
    },
    p_milestone_titles: milestoneFeatures,
    p_initial_message: initialMessageTemplate,
    p_deposit_item_label: depositItemLabel,
  });

  const order =
    rpcRes && typeof rpcRes === 'object' && !Array.isArray(rpcRes)
      ? {
          id: String((rpcRes as { order_id?: unknown }).order_id ?? ''),
          code: String((rpcRes as { code?: unknown }).code ?? ''),
        }
      : null;

  if (error || !order?.id) {
    throw new Error(error?.message ?? 'Could not place order.');
  }

  await notifyAllAdmins({
    category: 'order',
    title: isCustomDeal
      ? `New Custom Deal Contract ${order.code}`
      : `New Client Order ${order.code}`,
    body: `${session.email} initiated ${finalTitle} ($${(finalPriceCents / 100).toLocaleString()} USD)`,
    href: `/admin/orders/${order.id}`,
  });

  await enqueueTransactionalEmail({
    toEmail: session.email,
    template: 'order_placed_client',
    subject: `Order ${order.code} Confirmed — ${finalTitle}`,
    payload: {
      message: `Your engagement contract (${order.code}: ${finalTitle}) is active in your Client Portal.`,
      actionUrl: `${getSiteOrigin()}/portal/orders/${order.id}`,
    },
    entityType: 'order',
    entityId: order.id,
  });

  await enqueueTransactionalEmail({
    toEmail: getAdminAlertEmail(),
    template: 'order_placed_admin',
    subject: `New Portal Order ${order.code} from ${session.email}`,
    payload: {
      message: `${session.email} placed ${finalTitle} ($${(finalPriceCents / 100).toLocaleString()} USD).`,
      actionUrl: `${getSiteOrigin()}/admin/orders/${order.id}`,
    },
    entityType: 'order',
    entityId: order.id,
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    orderId: order.id,
    action: isCustomDeal ? 'order.custom_deal_offered' : 'order.placed_by_client',
    entityType: 'order',
    entityId: order.id,
    summary: `Client initiated ${isCustomDeal ? 'custom deal' : 'package'} contract ${order.code}: ${finalTitle}`,
    metadata: {
      serviceSlug: isOtherCustomService
        ? 'other-custom-engagement'
        : (matchedService?.slug ?? serviceSlug),
      tier: isCustomDeal ? 'custom' : (pkg?.tier ?? tier),
      priceCents: finalPriceCents,
      isCustomDeal,
    },
  });

  revalidatePath('/portal/orders');
  revalidatePath('/portal');
  revalidatePath('/contact');
  revalidatePath('/admin/orders');
  redirect(`/portal/orders/${order.id}`);
}

export async function submitOrderRequirementsAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const targetScopeNotes = String(formData.get('target_scope_notes') ?? '').trim();
  const accessInstructions = String(formData.get('access_instructions') ?? '').trim();

  if (!orderId) return;

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('id, client_id, status, requires_roe, roe_signed_at')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.client_id !== session.userId) {
    throw new Error('Forbidden.');
  }

  const { data: existingReq } = await admin
    .from('order_requirements')
    .select('id, verified_by_admin_at')
    .eq('order_id', orderId)
    .maybeSingle();

  if (existingReq?.verified_by_admin_at) {
    throw new Error('Verified order requirements are locked and cannot be edited.');
  }

  const { error: reqErr } = await admin.from('order_requirements').upsert(
    {
      order_id: orderId,
      client_id: session.userId,
      target_scope_notes: targetScopeNotes,
      access_instructions: accessInstructions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'order_id' }
  );
  if (reqErr) {
    throw new Error(reqErr.message);
  }

  if (order.status === 'pending_requirements') {
    const nextStatus: OrderStatus =
      order.requires_roe && !order.roe_signed_at ? 'pending_requirements' : 'in_progress';
    const { error: statusErr } = await admin
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', orderId);
    if (statusErr) {
      throw new Error(statusErr.message);
    }
  }

  await notifyAllAdmins({
    category: 'order',
    title: 'Client Updated Project Requirements',
    body: `${session.email} submitted technical scope & access notes.`,
    href: `/admin/orders/${orderId}`,
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    orderId,
    action: 'order.requirements_submitted',
    entityType: 'order',
    entityId: orderId,
    summary: 'Client updated project technical requirements and access notes',
  });

  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function signOrderRoeAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const targetsRaw = String(formData.get('authorized_targets') ?? '').trim();
  const excludedSystems = String(formData.get('excluded_systems') ?? '').trim() || null;
  const emergencyName = String(formData.get('emergency_contact_name') ?? '').trim();
  const emergencyPhone = String(formData.get('emergency_contact_phone') ?? '').trim();
  const signerFullName = String(formData.get('signer_full_name') ?? '').trim();
  const signerTitle = String(formData.get('signer_title') ?? '').trim() || null;
  const ownershipAttested =
    formData.get('ownership_attested') === 'on' || formData.get('ownership_attested') === 'true';

  if (
    !orderId ||
    !targetsRaw ||
    !emergencyName ||
    !emergencyPhone ||
    !signerFullName ||
    !ownershipAttested
  ) {
    return;
  }

  const authorizedTargets = targetsRaw
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (authorizedTargets.length === 0) return;

  const testingWindowStartRaw = String(formData.get('testing_window_start') ?? '').trim();
  const testingWindowEndRaw = String(formData.get('testing_window_end') ?? '').trim();

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('id, client_id, code, status, roe_signed_at')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.client_id !== session.userId) {
    throw new Error('Forbidden.');
  }

  if (order.roe_signed_at) {
    throw new Error('Rules of Engagement have already been signed for this engagement.');
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const parsedStart = testingWindowStartRaw ? new Date(testingWindowStartRaw) : new Date(nowMs);
  const parsedEnd = testingWindowEndRaw
    ? new Date(testingWindowEndRaw)
    : new Date(nowMs + 21 * 86400 * 1000);
  const startIso = Number.isNaN(parsedStart.getTime()) ? nowIso : parsedStart.toISOString();
  const endIso =
    Number.isNaN(parsedEnd.getTime()) || parsedEnd.getTime() <= new Date(startIso).getTime()
      ? new Date(new Date(startIso).getTime() + 21 * 86400 * 1000).toISOString()
      : parsedEnd.toISOString();

  let signerIpHash: string | null = null;
  try {
    const { headers } = await import('next/headers');
    const { createHash } = await import('node:crypto');
    const hdrs = await headers();
    const rawIp =
      hdrs.get('cf-connecting-ip') ||
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      hdrs.get('x-real-ip') ||
      'unknown';
    signerIpHash = createHash('sha256')
      .update(`${process.env.LEAD_IP_HASH_SALT ?? 'redwan-roe'}:${rawIp}`)
      .digest('hex');
  } catch {
    signerIpHash = null;
  }

  const { error: roeErr } = await admin.from('engagement_authorizations').insert({
    order_id: orderId,
    client_id: session.userId,
    authorized_targets: authorizedTargets,
    excluded_systems: excludedSystems,
    testing_window_start: startIso,
    testing_window_end: endIso,
    emergency_contact_name: emergencyName,
    emergency_contact_phone: emergencyPhone,
    signer_full_name: signerFullName,
    signer_title: signerTitle,
    signer_ip_hash: signerIpHash,
    ownership_attested: true,
    signed_at: nowIso,
  });
  if (roeErr) {
    throw new Error(roeErr.message);
  }

  const { error: orderErr } = await admin
    .from('orders')
    .update({
      roe_signed_at: nowIso,
      status: order.status === 'pending_requirements' ? 'in_progress' : order.status,
    })
    .eq('id', orderId);
  if (orderErr) {
    throw new Error(orderErr.message);
  }

  await notifyAllAdmins({
    category: 'roe',
    title: `Rules of Engagement Signed for ${order.code}`,
    body: `${signerFullName} authorized ${authorizedTargets.length} target(s).`,
    href: `/admin/orders/${orderId}`,
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    orderId,
    action: 'order.roe_signed',
    entityType: 'engagement_authorization',
    entityId: orderId,
    summary: `Signed Rules of Engagement for ${order.code}`,
    metadata: { authorizedTargets, signerFullName },
  });

  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function reviewDeliverableClientAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const deliverableId = String(formData.get('deliverable_id') ?? '').trim();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  const feedback = String(formData.get('feedback') ?? '').trim() || null;

  if (!deliverableId || (decision !== 'accepted' && decision !== 'revision_requested')) {
    return;
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc('review_order_deliverable', {
    p_deliverable_id: deliverableId,
    p_actor_id: session.userId,
    p_decision: decision,
    p_feedback: feedback ?? undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  await notifyAllAdmins({
    category: 'deliverable',
    title:
      decision === 'accepted'
        ? 'Client Accepted Deliverable'
        : 'Client Requested Deliverable Revision',
    body: feedback || `${session.email} marked deliverable ${decision.replace(/_/g, ' ')}.`,
    href: orderId ? `/admin/orders/${orderId}` : '/admin/orders',
  });

  await enqueueTransactionalEmail({
    toEmail: getAdminAlertEmail(),
    template: `deliverable_${decision}_admin`,
    subject:
      decision === 'accepted'
        ? `Deliverable Accepted by ${session.email}`
        : `Revision Requested by ${session.email}`,
    payload: {
      message: `${session.email} reviewed deliverable ${deliverableId}: ${decision}. ${feedback ? `Feedback: ${feedback}` : ''}`,
      actionUrl: `${getSiteOrigin()}${orderId ? `/admin/orders/${orderId}` : '/admin/orders'}`,
    },
    entityType: 'deliverable',
    entityId: deliverableId,
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    orderId: orderId || null,
    action: `deliverable.${decision}`,
    entityType: 'deliverable',
    entityId: deliverableId,
    summary: `Client marked deliverable as ${decision}`,
    metadata: { feedback },
  });

  if (orderId) {
    revalidatePath(`/portal/orders/${orderId}`);
    revalidatePath(`/admin/orders/${orderId}`);
  }
  revalidatePath('/portal/orders');
  revalidatePath('/portal/invoices');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/invoices');
}

export async function submitInvoicePaymentProofAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const invoiceId = String(formData.get('invoice_id') ?? '').trim();
  const rawMethod = (String(formData.get('method') ?? 'bank_transfer').trim() ||
    'bank_transfer') as PaymentMethod;
  if (!ALLOWED_PAYMENT_METHODS.has(rawMethod)) {
    throw new Error(`Unsupported payment method: ${rawMethod}`);
  }
  const method: PaymentMethod = rawMethod;
  const reference = String(formData.get('reference') ?? '').trim();
  const amountMajor = Number(formData.get('amount_major') ?? 0);
  const r2Key = String(formData.get('r2_key') ?? '').trim();
  const filename = String(formData.get('filename') ?? '').trim();
  const providedMime = String(formData.get('mime') || formData.get('mime_type') || '').trim();
  const sizeBytes = Number(formData.get('size_bytes') ?? 0);
  const declaredSha256 = String(formData.get('sha256_checksum') ?? '').trim().toLowerCase() || null;

  if (!invoiceId || !reference || amountMajor <= 0) return;

  const { PORTAL_ALLOWED, extFromFilename, isAllowedMime, resolveMimeType, validateMagicBytes } = await import('@/lib/mime');
  const { createHash } = await import('node:crypto');

  if (r2Key && filename) {
    const proofExt = extFromFilename(filename);
    const resolvedProofMime = resolveMimeType(filename, providedMime);
    if (!proofExt || !isAllowedMime(proofExt, resolvedProofMime, PORTAL_ALLOWED)) {
      throw new Error('Unsupported payment proof MIME type or file extension.');
    }
  }

  const admin = getSupabaseAdmin();
  const { data: invoice } = await admin
    .from('invoices')
    .select(
      'id, code, client_id, order_id, currency, fx_rate_to_usd, status, total_cents, amount_paid_cents, credited_cents'
    )
    .eq('id', invoiceId)
    .maybeSingle();

  if (!invoice || invoice.client_id !== session.userId) {
    throw new Error('Forbidden.');
  }

  if (
    invoice.status !== 'issued' &&
    invoice.status !== 'partially_paid' &&
    invoice.status !== 'overdue'
  ) {
    throw new Error('Invoice is not open for payment submission.');
  }

  const amountCents = Math.round(amountMajor * 100);
  const paymentDecision = validatePaymentSubmission({
    invoiceTotalCents: invoice.total_cents,
    amountPaidCents: invoice.amount_paid_cents,
    creditedCents: invoice.credited_cents,
    invoiceCurrency: invoice.currency,
    paymentAmountCents: amountCents,
    paymentCurrency: invoice.currency,
  });
  if (!paymentDecision.ok) {
    if (paymentDecision.reason === 'overpayment') {
      throw new Error('Payment amount exceeds remaining invoice balance.');
    }
    throw new Error('Invalid payment amount or currency.');
  }

  let proofFileId: string | null = null;
  if (r2Key && filename && sizeBytes > 0) {
    const resolvedProofMime = resolveMimeType(filename, providedMime);
    const expectedPrefix = `private/${session.userId}/payment_proof/`;
    if (!r2Key.startsWith(expectedPrefix) || r2Key.includes('..')) {
      throw new Error('Invalid payment proof storage key prefix.');
    }
    let verifiedSha256: string | null =
      declaredSha256 && /^[a-f0-9]{64}$/.test(declaredSha256) ? declaredSha256 : null;
    if (isR2Configured()) {
      const okSize = await verifyStoredPortalObjectSize(r2Key, sizeBytes);
      if (!okSize) {
        throw new Error('Uploaded payment proof object could not be verified in private storage.');
      }
      if (sizeBytes <= 10 * 1024 * 1024) {
        const { getPrivateObjectBytes } = await import('@/lib/r2');
        const proofBytes = await getPrivateObjectBytes(r2Key);
        if (!validateMagicBytes(proofBytes, resolvedProofMime)) {
          throw new Error('Uploaded payment proof file signature does not match its declared MIME type.');
        }
        verifiedSha256 = createHash('sha256').update(proofBytes).digest('hex');
      } else {
        const headBytes = await getPrivateObjectHeadBytes(r2Key, 64);
        if (!headBytes || !validateMagicBytes(headBytes, resolvedProofMime)) {
          throw new Error('Uploaded payment proof file signature does not match its declared MIME type.');
        }
      }
    }

    const retentionUntil = new Date(Date.now() + 365 * 86400 * 1000).toISOString();
    const { data: vFile, error: fileErr } = await admin
      .from('vault_files')
      .insert({
        owner_client_id: session.userId,
        order_id: invoice.order_id,
        invoice_id: invoice.id,
        category: 'payment_proof',
        r2_key: r2Key,
        filename,
        mime_type: resolvedProofMime,
        size_bytes: sizeBytes,
        sha256_checksum: verifiedSha256,
        retention_until: retentionUntil,
        uploaded_by: session.userId,
      })
      .select('id')
      .single();
    if (fileErr || !vFile) {
      throw new Error(fileErr?.message ?? 'Could not register payment proof file.');
    }
    proofFileId = vFile.id;
  }

  const { data: payment, error: paymentErr } = await admin
    .from('payments')
    .insert({
      invoice_id: invoice.id,
      order_id: invoice.order_id,
      client_id: session.userId,
      amount_cents: amountCents,
      currency: invoice.currency,
      fx_rate_to_usd: invoice.fx_rate_to_usd,
      method,
      reference,
      proof_file_id: proofFileId,
      status: 'submitted',
    })
    .select('id, code')
    .single();
  if (paymentErr || !payment) {
    if (proofFileId) {
      await admin.from('vault_files').delete().eq('id', proofFileId);
    }
    throw new Error(paymentErr?.message ?? 'Could not submit payment proof.');
  }

  await notifyAllAdmins({
    category: 'payment',
    title: `Payment Submitted (${payment.code ?? ''})`,
    body: `Invoice ${invoice.code}: ${invoice.currency} ${amountMajor.toLocaleString()} via ${method}`,
    href: `/admin/invoices/${invoice.id}`,
  });

  await enqueueTransactionalEmail({
    toEmail: getAdminAlertEmail(),
    template: 'payment_proof_submitted_admin',
    subject: `Payment Proof Submitted (${payment.code ?? ''}) for ${invoice.code}`,
    payload: {
      message: `${session.email} submitted payment proof (${invoice.currency} ${amountMajor.toLocaleString()} via ${method}, Ref: ${reference}) for invoice ${invoice.code}.`,
      actionUrl: `${getSiteOrigin()}/admin/invoices/${invoice.id}`,
    },
    entityType: 'payment',
    entityId: payment.id,
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    orderId: invoice.order_id,
    action: 'payment.submitted',
    entityType: 'payment',
    entityId: payment.id,
    summary: `Submitted payment ${payment.code ?? ''} for ${invoice.code} (${method}: ${reference})`,
    metadata: { amountCents, method, reference },
  });

  revalidatePath(`/portal/invoices/${invoice.id}`);
  revalidatePath('/portal/invoices');
  revalidatePath(`/admin/invoices/${invoice.id}`);
  revalidatePath('/admin/invoices');
}

const ALLOWED_TICKET_CATEGORIES = new Set([
  'general',
  'technical_support',
  'security_incident',
  'order_question',
  'billing',
  'retainer_request',
]);

export async function createClientTicketAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const rawPriority = String(formData.get('priority') ?? 'medium').trim();
  const priority: TicketPriority =
    rawPriority === 'urgent' || rawPriority === 'high' || rawPriority === 'low'
      ? rawPriority
      : 'medium';
  const candidateCategory = String(formData.get('category') ?? 'general').trim() || 'general';
  const rawCategory = ALLOWED_TICKET_CATEGORIES.has(candidateCategory)
    ? candidateCategory
    : 'general';
  const orderId = String(formData.get('order_id') ?? '').trim() || null;

  if (!subject || !body) return;

  const admin = getSupabaseAdmin();
  if (orderId) {
    const { data: order } = await admin
      .from('orders')
      .select('id, client_id')
      .eq('id', orderId)
      .maybeSingle();
    if (!order || order.client_id !== session.userId) {
      throw new Error('Forbidden: order does not belong to client.');
    }
  }

  const { data: ticket, error: ticketErr } = await admin
    .from('tickets')
    .insert({
      client_id: session.userId,
      order_id: orderId,
      subject,
      category: rawCategory,
      priority,
      status: 'open',
    })
    .select('id, code')
    .single();

  if (ticketErr || !ticket) {
    throw new Error(ticketErr?.message ?? 'Could not create support ticket.');
  }

  const ticketFileId = await registerVaultAttachmentFromForm(admin, {
    formData,
    ownerClientId: session.userId,
    uploadedBy: session.userId,
    category: 'ticket_attachment',
    orderId,
    ticketId: ticket.id,
  });

  const { error: msgErr } = await admin.from('ticket_messages').insert({
    ticket_id: ticket.id,
    author_id: session.userId,
    body,
    is_internal_note: false,
    attachment_file_ids: ticketFileId ? [ticketFileId] : [],
  });
  if (msgErr) {
    throw new Error(msgErr.message);
  }

  await notifyAllAdmins({
    category: 'ticket',
    title: `New Support Ticket ${ticket.code}`,
    body: subject,
    href: `/admin/tickets/${ticket.id}`,
  });

  await enqueueTransactionalEmail({
    toEmail: getAdminAlertEmail(),
    template: 'ticket_created_admin',
    subject: `[${ticket.code}] New Support Ticket (${priority.toUpperCase()}): ${subject}`,
    payload: {
      message: `${session.email} opened ticket ${ticket.code} (${rawCategory}, priority: ${priority}):\n\n${body.slice(0, 400)}`,
      actionUrl: `${getSiteOrigin()}/admin/tickets/${ticket.id}`,
    },
    entityType: 'ticket',
    entityId: ticket.id,
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    orderId,
    action: 'ticket.created',
    entityType: 'ticket',
    entityId: ticket.id,
    summary: `Opened support ticket ${ticket.code}: ${subject}`,
    metadata: { priority, category: rawCategory },
  });

  revalidatePath('/portal/tickets');
  revalidatePath('/admin/tickets');
  redirect(`/portal/tickets/${ticket.id}`);
}

export async function submitClientReviewAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const rawRating = Number(formData.get('rating_overall') ?? 5);
  if (!Number.isFinite(rawRating)) {
    throw new Error('Invalid rating value.');
  }
  const ratingOverall = Math.min(5, Math.max(1, Math.round(rawRating)));
  const headline = String(formData.get('headline') ?? '').trim() || null;
  const reviewText = String(formData.get('review_text') ?? '').trim();

  if (!orderId || !reviewText) return;

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('id, client_id, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.client_id !== session.userId) {
    throw new Error('Forbidden.');
  }
  if (order.status !== 'completed') {
    throw new Error('Order must be completed before submitting a client review.');
  }

  const { error } = await admin.from('client_reviews').upsert(
    {
      order_id: orderId,
      client_id: session.userId,
      rating_overall: ratingOverall,
      rating_communication: ratingOverall,
      rating_quality: ratingOverall,
      rating_timeliness: ratingOverall,
      headline,
      review_text: reviewText,
      is_public_approved: false,
    },
    { onConflict: 'order_id' }
  );
  if (error) {
    throw new Error(error.message);
  }

  await notifyAllAdmins({
    category: 'review',
    title: `New ${ratingOverall}★ Client Review Submitted`,
    body: headline || reviewText.slice(0, 120),
    href: '/admin/reviews',
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    orderId,
    action: 'review.submitted',
    entityType: 'review',
    entityId: orderId,
    summary: `Submitted ${ratingOverall}-star review for order`,
    metadata: { ratingOverall, headline },
  });

  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath('/admin/reviews');
}

export async function updateClientProfileAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const fullName = String(formData.get('full_name') ?? '').trim();
  const phoneE164 = String(formData.get('phone_e164') ?? '').trim() || null;
  const timezone = String(formData.get('timezone') ?? 'UTC').trim() || 'UTC';
  const companyName = String(formData.get('company_name') ?? '').trim() || null;
  const companyRole = String(formData.get('company_role') ?? '').trim() || null;
  const websiteUrl = sanitizeHttpUrl(String(formData.get('website_url') ?? '').trim());
  const taxId = String(formData.get('tax_id') ?? '').trim() || null;
  const preferredCurrency = String(formData.get('preferred_currency') ?? 'USD')
    .trim()
    .toUpperCase();

  const billingAddress = {
    line1: String(formData.get('billing_line1') ?? '').trim(),
    line2: String(formData.get('billing_line2') ?? '').trim(),
    city: String(formData.get('billing_city') ?? '').trim(),
    state: String(formData.get('billing_state') ?? '').trim(),
    postal_code: String(formData.get('billing_postal_code') ?? '').trim(),
    country: String(formData.get('billing_country') ?? '').trim(),
  };
  const hasBillingFields = Object.values(billingAddress).some(Boolean);

  const admin = getSupabaseAdmin();
  const { error: profErr } = await admin
    .from('profiles')
    .update({
      full_name: fullName || session.fullName,
      phone: phoneE164,
      whatsapp: phoneE164,
      company: companyName,
      timezone,
    })
    .eq('id', session.userId);
  if (profErr) throw new Error(profErr.message);

  const upsertPayload: Database['public']['Tables']['client_profiles']['Insert'] = {
    user_id: session.userId,
    company_name: companyName,
    company_role: companyRole,
    website_url: websiteUrl,
    tax_id: taxId,
    preferred_currency: preferredCurrency,
  };
  if (hasBillingFields || formData.has('billing_line1')) {
    upsertPayload.billing_address = billingAddress as Json;
  }

  const { error: cpErr } = await admin.from('client_profiles').upsert(upsertPayload);
  if (cpErr) throw new Error(cpErr.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    action: 'client.profile_updated',
    entityType: 'client',
    entityId: session.userId,
    summary: 'Updated client billing and organization profile',
    metadata: { companyName, preferredCurrency, timezone, hasBillingAddress: hasBillingFields },
  });

  revalidatePath('/portal/profile');
  revalidatePath('/portal/invoices');
}


// =============================================================================
// 5. PHASE 2 LIFECYCLE WORKFLOWS (MULTI-LINE INVOICE, CREDIT NOTES, NDA, CANCEL, RETAINERS)
// =============================================================================

export async function sendDraftProposalAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const proposalId = String(formData.get('proposal_id') ?? '').trim();
  if (!proposalId) return;

  const admin = getSupabaseAdmin();
  const { data: proposal, error: fetchErr } = await admin
    .from('proposals')
    .select('id, code, title, client_id, recipient_name, recipient_email, total_cents, currency, status')
    .eq('id', proposalId)
    .maybeSingle();

  if (fetchErr || !proposal) {
    throw new Error('Proposal not found.');
  }
  if (proposal.status !== 'draft') {
    throw new Error(`Only draft proposals can be sent (current status: ${proposal.status}).`);
  }

  const { error: updErr } = await admin
    .from('proposals')
    .update({ status: 'sent' })
    .eq('id', proposalId)
    .eq('status', 'draft');
  if (updErr) throw new Error(updErr.message);

  if (proposal.client_id) {
    await createInAppNotification({
      recipientId: proposal.client_id,
      category: 'proposal',
      title: `Proposal ${proposal.code ?? ''}: ${proposal.title}`,
      body: 'A project proposal is ready for your review in the Client Portal.',
      href: `/portal/proposals/${proposal.id}`,
    });
  }

  const totalDisplay = (proposal.total_cents / 100).toLocaleString();
  await enqueueTransactionalEmail({
    toEmail: proposal.recipient_email,
    template: 'proposal_sent',
    subject: `Proposal ${proposal.code ?? ''} — ${proposal.title}`,
    payload: {
      message: `Hi ${proposal.recipient_name}, proposal ${proposal.code ?? ''} (${proposal.title}) for ${proposal.currency} ${totalDisplay} is ready for your review.`,
      actionUrl: `${getSiteOrigin()}/portal/proposals/${proposal.id}`,
    },
    entityType: 'proposal',
    entityId: proposal.id,
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId: proposal.client_id,
    action: 'proposal.sent',
    entityType: 'proposal',
    entityId: proposal.id,
    summary: `Sent previously drafted proposal ${proposal.code ?? ''}`,
    metadata: { proposalId },
  });

  revalidatePath('/admin/proposals');
  revalidatePath('/admin/pipeline');
  revalidatePath('/portal/proposals');
  revalidatePath(`/portal/proposals/${proposalId}`);
}

export async function issueCreditNoteAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const invoiceId = String(formData.get('invoice_id') ?? '').trim();
  const amountMajor = Number(formData.get('amount_major') ?? 0);
  const rawCents = Number(formData.get('amount_cents') ?? 0);
  const amountCents =
    Number.isFinite(rawCents) && rawCents > 0
      ? Math.round(rawCents)
      : Math.round(amountMajor * 100);
  const reason = String(formData.get('reason') ?? '').trim();

  if (!invoiceId || !Number.isFinite(amountCents) || amountCents <= 0 || !reason) {
    throw new Error('Invoice ID, positive credit amount, and reason are required.');
  }

  const admin = getSupabaseAdmin();
  const { data: rpcRes, error } = await admin.rpc('create_credit_note_atomic', {
    p_invoice_id: invoiceId,
    p_admin_id: session.userId,
    p_amount_cents: amountCents,
    p_reason: reason,
  });
  if (error) {
    throw new Error(error.message);
  }

  const resultObj =
    rpcRes && typeof rpcRes === 'object' && !Array.isArray(rpcRes)
      ? (rpcRes as { code?: string; new_status?: string })
      : null;

  const { data: invoice } = await admin
    .from('invoices')
    .select('client_id, code, currency, order_id')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invoice?.client_id) {
    const displayAmount = (amountCents / 100).toLocaleString();
    // Note: create_credit_note_atomic already inserts the in-app notification atomically.
    const clientEmail = await lookupProfileEmail(invoice.client_id);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'invoice_credit_note',
        subject: `Credit Note ${resultObj?.code ?? ''} Applied — Invoice ${invoice.code ?? ''}`,
        payload: {
          message: `A credit note (${resultObj?.code ?? ''}) for ${invoice.currency} ${displayAmount} has been applied to your invoice ${invoice.code ?? ''}. Reason: ${reason}`,
          actionUrl: `${getSiteOrigin()}/portal/invoices/${invoiceId}`,
        },
        entityType: 'invoice',
        entityId: invoiceId,
      });
    }
  }

  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath('/admin/billing');
  revalidatePath('/portal/invoices');
  revalidatePath(`/portal/invoices/${invoiceId}`);
  if (invoice?.order_id) {
    revalidatePath(`/admin/orders/${invoice.order_id}`);
    revalidatePath(`/portal/orders/${invoice.order_id}`);
  }
}

export async function createMultiLineInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const orderId = String(formData.get('order_id') ?? '').trim() || null;
  const milestoneId = String(formData.get('milestone_id') ?? '').trim() || null;
  const parsedCurrency = currencySchema.safeParse(formData.get('currency') ?? 'USD');
  const currency = parsedCurrency.success ? parsedCurrency.data : 'USD';
  const rawFxInput = formData.get('fx_rate_to_usd');
  const parsedFx =
    rawFxInput !== null && String(rawFxInput).trim() !== ''
      ? positiveFiniteFxRateSchema.safeParse(Number(rawFxInput))
      : { success: true as const, data: 1 };
  if (!parsedFx.success) {
    throw new Error('FX rate to USD must be a positive finite number.');
  }
  const fxRate = parsedFx.data;
  const discountMajor = Math.max(0, Number(formData.get('discount_major') ?? 0) || 0);
  const taxRateBps = Math.max(0, Math.round(Number(formData.get('tax_rate_bps') ?? 0) || 0));
  const dueDays = Math.max(1, Math.round(Number(formData.get('due_days') ?? 7) || 7));
  const paymentInstructions = String(formData.get('payment_instructions') ?? '').trim() || null;
  const notes = String(formData.get('notes') ?? '').trim() || null;
  const issueImmediately = parseFormBoolean(formData, 'issue_immediately');
  const redirectToInvoice = parseFormBoolean(formData, 'redirect_to_invoice');

  if (!clientId) {
    throw new Error('Client selection is required.');
  }

  interface RawLineItem {
    description?: string;
    qty?: number;
    quantity?: number;
    unit_price_major?: number;
    unit_price_cents?: number;
  }

  let items: Array<{ description: string; qty: number; quantity: number; unit_price_cents: number }> = [];
  const itemsJsonRaw = String(formData.get('items_json') ?? '').trim();
  if (itemsJsonRaw) {
    let parsed: RawLineItem[] = [];
    try {
      parsed = JSON.parse(itemsJsonRaw) as RawLineItem[];
    } catch {
      throw new Error('Invalid invoice line items JSON.');
    }
    if (Array.isArray(parsed)) {
      items = parsed
        .map((row) => {
          const desc = String(row.description ?? '').trim();
          const qty = Math.max(1, Math.round(Number(row.quantity ?? row.qty ?? 1) || 1));
          const cents =
            typeof row.unit_price_cents === 'number' && row.unit_price_cents > 0
              ? Math.round(row.unit_price_cents)
              : Math.round(Number(row.unit_price_major ?? 0) * 100);
          return { description: desc, qty, quantity: qty, unit_price_cents: cents };
        })
        .filter((row) => row.description && row.unit_price_cents > 0);
    }
  } else {
    const descriptions = formData.getAll('item_description').map((v) => String(v ?? '').trim());
    const quantities = formData.getAll('item_quantity').map((v) => Number(v ?? 1));
    const unitPrices = formData.getAll('item_unit_price_major').map((v) => Number(v ?? 0));

    if (descriptions.length > 0) {
      items = descriptions
        .map((desc, i) => {
          const qty = Math.max(1, Math.round(quantities[i] || 1));
          return {
            description: desc,
            qty,
            quantity: qty,
            unit_price_cents: Math.round((unitPrices[i] || 0) * 100),
          };
        })
        .filter((row) => row.description && row.unit_price_cents > 0);
    } else {
      const singleDesc = String(formData.get('description') ?? '').trim();
      const singleAmount = Number(formData.get('amount_major') ?? 0);
      if (singleDesc && singleAmount > 0) {
        items = [
          {
            description: singleDesc,
            qty: 1,
            quantity: 1,
            unit_price_cents: Math.round(singleAmount * 100),
          },
        ];
      }
    }
  }

  if (items.length === 0) {
    throw new Error('Add at least one billable invoice line item.');
  }

  const admin = getSupabaseAdmin();
  const { data: rpcRes, error } = await admin.rpc('create_draft_invoice_multi_atomic', {
    p_client_id: clientId,
    p_order_id: orderId,
    p_milestone_id: milestoneId,
    p_currency: currency,
    p_fx_rate_to_usd: fxRate,
    p_discount_cents: Math.round(discountMajor * 100),
    p_tax_rate_bps: taxRateBps,
    p_due_days: dueDays,
    p_payment_instructions: paymentInstructions,
    p_notes: notes,
    p_items: items as unknown as Json,
    p_issue_immediately: issueImmediately,
    p_admin_id: session.userId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const created =
    rpcRes && typeof rpcRes === 'object' && !Array.isArray(rpcRes)
      ? (rpcRes as { invoice_id?: string; code?: string; total_cents?: number })
      : null;

  if (created?.invoice_id && issueImmediately) {
    const totalDisplay = ((created.total_cents ?? 0) / 100).toLocaleString();
    await createInAppNotification({
      recipientId: clientId,
      category: 'invoice',
      title: `Invoice Issued: ${created.code ?? ''}`,
      body: `${items[0].description}${items.length > 1 ? ` +${items.length - 1} items` : ''} (${currency} ${totalDisplay})`,
      href: `/portal/invoices/${created.invoice_id}`,
    });
    const clientEmail = await lookupProfileEmail(clientId);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'invoice_issued',
        subject: `Invoice ${created.code ?? ''} Issued (${currency} ${totalDisplay})`,
        payload: {
          message: `Invoice ${created.code ?? ''} for ${currency} ${totalDisplay} is now available in your Client Portal.`,
          actionUrl: `${getSiteOrigin()}/portal/invoices/${created.invoice_id}`,
        },
        entityType: 'invoice',
        entityId: created.invoice_id,
      });
    }
  }

  revalidatePath('/admin/invoices');
  revalidatePath('/admin/billing');
  revalidatePath('/portal/invoices');
  if (orderId) {
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/portal/orders/${orderId}`);
  }
  if (redirectToInvoice && created?.invoice_id) {
    redirect(`/admin/invoices/${created.invoice_id}`);
  }
}

export async function sendDraftInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const invoiceId = String(formData.get('invoice_id') ?? '').trim();
  if (!invoiceId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc('send_draft_invoice_atomic', {
    p_invoice_id: invoiceId,
    p_admin_id: session.userId,
  });
  if (error) throw new Error(error.message);

  const { data: invoice } = await admin
    .from('invoices')
    .select('client_id, code, currency, total_cents, order_id')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invoice?.client_id) {
    const displayTotal = (invoice.total_cents / 100).toLocaleString();
    await createInAppNotification({
      recipientId: invoice.client_id,
      category: 'invoice',
      title: `Invoice Issued: ${invoice.code ?? ''}`,
      body: `Amount due: ${invoice.currency} ${displayTotal}`,
      href: `/portal/invoices/${invoiceId}`,
    });
    const clientEmail = await lookupProfileEmail(invoice.client_id);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'invoice_issued',
        subject: `Invoice ${invoice.code ?? ''} Issued (${invoice.currency} ${displayTotal})`,
        payload: {
          message: `Draft invoice ${invoice.code ?? ''} (${invoice.currency} ${displayTotal}) has now been officially issued to your Client Portal.`,
          actionUrl: `${getSiteOrigin()}/portal/invoices/${invoiceId}`,
        },
        entityType: 'invoice',
        entityId: invoiceId,
      });
    }
  }

  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath('/admin/billing');
  revalidatePath('/portal/invoices');
  revalidatePath(`/portal/invoices/${invoiceId}`);
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const invoiceId = String(formData.get('invoice_id') ?? '').trim();
  if (!invoiceId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc('void_invoice_atomic', {
    p_invoice_id: invoiceId,
    p_admin_id: session.userId,
  });
  if (error) throw new Error(error.message);

  const { data: invoice } = await admin
    .from('invoices')
    .select('client_id, code, order_id')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invoice?.client_id) {
    await createInAppNotification({
      recipientId: invoice.client_id,
      category: 'invoice',
      title: `Invoice ${invoice.code ?? ''} Voided`,
      body: 'This invoice has been voided by the administrator and no payment is due.',
      href: `/portal/invoices/${invoiceId}`,
    });
  }

  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath('/admin/billing');
  revalidatePath('/portal/invoices');
  revalidatePath(`/portal/invoices/${invoiceId}`);
}

export async function recordManualPaymentAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const invoiceId = String(formData.get('invoice_id') ?? '').trim();
  const rawMethod = String(formData.get('method') ?? 'manual').trim();
  const method: PaymentMethod = ALLOWED_PAYMENT_METHODS.has(rawMethod as PaymentMethod)
    ? (rawMethod as PaymentMethod)
    : 'manual';
  const amountMajor = Number(formData.get('amount_major') ?? 0);
  const amountCents = Math.round(amountMajor * 100);
  const reference = String(formData.get('reference') ?? '').trim();
  const rawFxRate = formData.get('fx_rate');
  const hasExplicitFx = rawFxRate !== null && String(rawFxRate).trim() !== '';
  let validatedFxRate: number | null = null;
  if (hasExplicitFx) {
    const parsedFx = positiveFiniteFxRateSchema.safeParse(Number(rawFxRate));
    if (!parsedFx.success) {
      throw new Error('FX rate must be a positive finite number.');
    }
    validatedFxRate = parsedFx.data;
  }

  if (!invoiceId || !Number.isFinite(amountCents) || amountCents <= 0 || !reference) {
    throw new Error('Invoice, positive payment amount, and transaction reference are required.');
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc('record_manual_payment_atomic', {
    p_invoice_id: invoiceId,
    p_admin_id: session.userId,
    p_method: method,
    p_amount_cents: amountCents,
    p_reference: reference,
    p_fx_rate: validatedFxRate,
  });
  if (error) throw new Error(error.message);

  const { data: invoice } = await admin
    .from('invoices')
    .select('client_id, code, currency, order_id')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invoice?.client_id) {
    const displayAmount = (amountCents / 100).toLocaleString();
    await createInAppNotification({
      recipientId: invoice.client_id,
      category: 'payment',
      title: `Payment Recorded on ${invoice.code ?? ''}`,
      body: `Verified manual payment (${method}) of ${invoice.currency} ${displayAmount}.`,
      href: `/portal/invoices/${invoiceId}`,
    });
    const clientEmail = await lookupProfileEmail(invoice.client_id);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'payment_confirmed',
        subject: `Payment Recorded for Invoice ${invoice.code ?? ''}`,
        payload: {
          message: `We recorded a verified payment of ${invoice.currency} ${displayAmount} (${method}, Ref: ${reference}) against Invoice ${invoice.code ?? ''}.`,
          actionUrl: `${getSiteOrigin()}/portal/invoices/${invoiceId}`,
        },
        entityType: 'invoice',
        entityId: invoiceId,
      });
    }
  }

  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath('/admin/billing');
  revalidatePath('/portal/invoices');
  revalidatePath(`/portal/invoices/${invoiceId}`);
  if (invoice?.order_id) {
    revalidatePath(`/admin/orders/${invoice.order_id}`);
    revalidatePath(`/portal/orders/${invoice.order_id}`);
  }
}

export async function createPaidRevisionInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const extraRevisions = Math.max(1, Math.round(Number(formData.get('extra_revisions') ?? 1) || 1));
  const feeMajor = Number(formData.get('fee_major') ?? 0);
  const feeCents = Math.round(feeMajor * 100);
  const summary = String(formData.get('summary') ?? '').trim();

  if (!orderId || !Number.isFinite(feeCents) || feeCents <= 0 || !summary) {
    throw new Error('Order ID, positive fee, and revision scope summary are required.');
  }

  const admin = getSupabaseAdmin();
  const { data: rpcRes, error } = await admin.rpc('create_paid_revision_invoice_atomic', {
    p_order_id: orderId,
    p_admin_id: session.userId,
    p_extra_revisions: extraRevisions,
    p_fee_cents: feeCents,
    p_summary: summary,
  });
  if (error) throw new Error(error.message);

  const created =
    rpcRes && typeof rpcRes === 'object' && !Array.isArray(rpcRes)
      ? (rpcRes as { invoice_id?: string; invoice_code?: string })
      : null;

  const { data: order } = await admin
    .from('orders')
    .select('client_id, code, currency')
    .eq('id', orderId)
    .maybeSingle();

  if (order?.client_id) {
    const displayFee = (feeCents / 100).toLocaleString();
    // Note: create_paid_revision_invoice_atomic already inserts the in-app notification atomically.
    const clientEmail = await lookupProfileEmail(order.client_id);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'invoice_issued',
        subject: `Paid Revision Addendum Invoice — ${order.code}`,
        payload: {
          message: `A paid revision addendum (+${extraRevisions} revision round(s) upon payment) for ${order.currency ?? 'USD'} ${displayFee} has been issued for order ${order.code}: ${summary}`,
          actionUrl: `${getSiteOrigin()}/portal/invoices/${created?.invoice_id ?? ''}`,
        },
        entityType: 'invoice',
        entityId: created?.invoice_id ?? orderId,
      });
    }
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath('/admin/invoices');
  revalidatePath('/admin/billing');
  revalidatePath('/portal/invoices');
}

export async function declineProposalClientAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const proposalId = String(formData.get('proposal_id') ?? '').trim();
  const reason = String(formData.get('decline_reason') ?? formData.get('reason') ?? '').trim() || null;
  if (!proposalId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc('decline_proposal_client_atomic', {
    p_proposal_id: proposalId,
    p_actor_id: session.userId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);

  await notifyAllAdmins({
    category: 'proposal',
    title: 'Proposal Declined by Client',
    body: reason ? `${session.email}: ${reason}` : `${session.email} declined proposal ${proposalId}.`,
    href: '/admin/proposals',
  });

  await enqueueTransactionalEmail({
    toEmail: getAdminAlertEmail(),
    template: 'proposal_declined_admin',
    subject: `Client Declined Proposal — ${session.email}`,
    payload: {
      message: `${session.email} declined proposal ${proposalId}.${reason ? `\n\nReason: ${reason}` : ''}`,
      actionUrl: `${getSiteOrigin()}/admin/proposals`,
    },
    entityType: 'proposal',
    entityId: proposalId,
  });

  revalidatePath('/portal/proposals');
  revalidatePath(`/portal/proposals/${proposalId}`);
  revalidatePath('/admin/proposals');
  revalidatePath('/admin/pipeline');
}

export async function acceptOrderNdaAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  if (!orderId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc('accept_order_nda_atomic', {
    p_order_id: orderId,
    p_actor_id: session.userId,
  });
  if (error) throw new Error(error.message);

  const { data: order } = await admin
    .from('orders')
    .select('code, title')
    .eq('id', orderId)
    .maybeSingle();

  await notifyAllAdmins({
    category: 'order',
    title: `NDA Accepted on ${order?.code ?? 'Order'}`,
    body: `${session.email} executed confidentiality NDA agreement.`,
    href: `/admin/orders/${orderId}`,
  });

  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/portal/orders');
  revalidatePath('/admin/orders');
}

export async function submitCancellationRequestAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  if (!orderId || reason.length < 5) {
    throw new Error('Provide a cancellation reason of at least 5 characters.');
  }

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('id, code, client_id, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.client_id !== session.userId) {
    throw new Error('Forbidden: order does not belong to your account.');
  }
  if (order.status === 'cancelled' || order.status === 'completed') {
    throw new Error(`Order is already ${order.status}.`);
  }

  const { data: created, error } = await admin
    .from('cancellation_requests')
    .insert({
      order_id: orderId,
      requested_by: session.userId,
      reason,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  await notifyAllAdmins({
    category: 'order',
    title: `Cancellation Request on ${order.code}`,
    body: reason.slice(0, 140),
    href: `/admin/orders/${orderId}`,
  });

  await enqueueTransactionalEmail({
    toEmail: getAdminAlertEmail(),
    template: 'order_cancellation_requested',
    subject: `[${order.code}] Client Submitted Cancellation Request`,
    payload: {
      message: `${session.email} requested cancellation of ${order.code}.\n\nReason: ${reason}`,
      actionUrl: `${getSiteOrigin()}/admin/orders/${orderId}`,
    },
    entityType: 'order',
    entityId: orderId,
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    orderId,
    action: 'order.cancellation_requested',
    entityType: 'cancellation_request',
    entityId: created?.id ?? orderId,
    summary: `Client requested cancellation on ${order.code}`,
    metadata: { reason },
  });

  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
}

export async function resolveCancellationRequestAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const requestId = String(formData.get('request_id') ?? '').trim();
  const rawDecision = String(formData.get('decision') ?? '').trim();
  const decision = rawDecision === 'approved' ? 'approved' : 'declined';
  const notes = String(formData.get('resolution_notes') ?? '').trim() || null;

  if (!requestId) return;

  const admin = getSupabaseAdmin();
  const { data: reqRow } = await admin
    .from('cancellation_requests')
    .select('order_id, requested_by')
    .eq('id', requestId)
    .maybeSingle();

  const { error } = await admin.rpc('resolve_order_cancellation_atomic', {
    p_request_id: requestId,
    p_admin_id: session.userId,
    p_decision: decision,
    p_resolution_notes: notes,
  });
  if (error) throw new Error(error.message);

  if (reqRow?.requested_by && reqRow.order_id) {
    // Note: resolve_order_cancellation_atomic already inserts the in-app notification atomically.
    const clientEmail = await lookupProfileEmail(reqRow.requested_by);
    if (clientEmail) {
      await enqueueTransactionalEmail({
        toEmail: clientEmail,
        template: 'order_cancellation_resolved',
        subject: `Order Cancellation Request ${decision === 'approved' ? 'Approved' : 'Declined'}`,
        payload: {
          message: `Your cancellation request has been ${decision}.${notes ? `\n\nNotes: ${notes}` : ''}`,
          actionUrl: `${getSiteOrigin()}/portal/orders/${reqRow.order_id}`,
        },
        entityType: 'order',
        entityId: reqRow.order_id,
      });
    }
  }

  revalidatePath('/admin/orders');
  revalidatePath('/portal/orders');
  if (reqRow?.order_id) {
    revalidatePath(`/admin/orders/${reqRow.order_id}`);
    revalidatePath(`/portal/orders/${reqRow.order_id}`);
  }
}

export async function renewRetainerCycleAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const retainerId = String(formData.get('retainer_id') ?? '').trim();
  if (!retainerId) return;

  const admin = getSupabaseAdmin();
  // renew_retainer_cycle_atomic atomically creates the invoice, in-app notification,
  // and transactional email_outbox row (template = 'retainer_renewed').
  const { error } = await admin.rpc('renew_retainer_cycle_atomic', {
    p_retainer_id: retainerId,
    p_admin_id: session.userId,
    p_force: true,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/retainers');
  revalidatePath('/admin/billing');
  revalidatePath('/admin/invoices');
  revalidatePath('/portal/retainers');
  revalidatePath('/portal/invoices');
}

const ALLOWED_MILESTONE_STATUSES = new Set(['pending', 'in_progress', 'delivered', 'approved']);

export async function addOrderMilestoneAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const amountUsd = Math.max(0, Number(formData.get('amount_usd') ?? 0) || 0);
  const dueDate = String(formData.get('due_date') ?? '').trim() || null;
  const weightPercent = Math.min(100, Math.max(0, Math.round(Number(formData.get('weight_percent') ?? 0) || 0)));

  if (!orderId || !title) {
    throw new Error('Order ID and milestone title are required.');
  }

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('client_id, currency')
    .eq('id', orderId)
    .maybeSingle();

  const { count } = await admin
    .from('order_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId);

  const { error } = await admin.from('order_milestones').insert({
    order_id: orderId,
    position: count ?? 0,
    title,
    description,
    amount_cents: Math.round(amountUsd * 100),
    currency: order?.currency ?? 'USD',
    due_date: dueDate,
    weight_percent: weightPercent,
    status: 'pending',
  });
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId: order?.client_id ?? null,
    orderId,
    action: 'order.milestone_added',
    entityType: 'order_milestone',
    summary: `Added milestone "${title}"`,
    metadata: { amountUsd },
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
}

export async function updateOrderMilestoneAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const milestoneId = String(formData.get('milestone_id') ?? '').trim();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const rawStatus = String(formData.get('status') ?? 'pending').trim();
  const status = ALLOWED_MILESTONE_STATUSES.has(rawStatus) ? rawStatus : 'pending';
  const title = String(formData.get('title') ?? '').trim();

  if (!milestoneId || !orderId) return;

  const updates: Database['public']['Tables']['order_milestones']['Update'] = {
    status,
    completed_at: status === 'approved' ? new Date().toISOString() : null,
  };
  if (title) updates.title = title;

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('order_milestones')
    .update(updates)
    .eq('id', milestoneId)
    .eq('order_id', orderId);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    orderId,
    action: 'order.milestone_updated',
    entityType: 'order_milestone',
    entityId: milestoneId,
    summary: `Updated milestone status to ${status}`,
    metadata: { status },
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
}

export async function deleteOrderMilestoneAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const milestoneId = String(formData.get('milestone_id') ?? '').trim();
  const orderId = String(formData.get('order_id') ?? '').trim();
  if (!milestoneId || !orderId) return;

  const admin = getSupabaseAdmin();
  const { data: linkedInv } = await admin
    .from('invoices')
    .select('id')
    .eq('milestone_id', milestoneId)
    .neq('status', 'void')
    .limit(1);
  if (linkedInv && linkedInv.length > 0) {
    throw new Error('Cannot delete a milestone with an active linked invoice.');
  }

  const { error } = await admin
    .from('order_milestones')
    .delete()
    .eq('id', milestoneId)
    .eq('order_id', orderId);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    orderId,
    action: 'order.milestone_deleted',
    entityType: 'order_milestone',
    entityId: milestoneId,
    summary: 'Removed milestone from order',
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
}

export async function generateMilestoneInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const milestoneId = String(formData.get('milestone_id') ?? '').trim();
  const orderId = String(formData.get('order_id') ?? '').trim();
  if (!milestoneId || !orderId) return;

  const admin = getSupabaseAdmin();
  const [{ data: milestone }, { data: order }, { data: existingInv }] = await Promise.all([
    admin.from('order_milestones').select('*').eq('id', milestoneId).eq('order_id', orderId).maybeSingle(),
    admin.from('orders').select('id, code, client_id, currency').eq('id', orderId).maybeSingle(),
    admin
      .from('invoices')
      .select('id, code')
      .eq('milestone_id', milestoneId)
      .neq('status', 'void')
      .limit(1),
  ]);

  if (!milestone || !order) {
    throw new Error('Milestone or parent order not found.');
  }
  if (existingInv && existingInv.length > 0) {
    throw new Error(`Milestone already invoiced (${existingInv[0].code ?? existingInv[0].id}).`);
  }
  if (milestone.amount_cents <= 0) {
    throw new Error('Milestone amount must be greater than zero to generate an invoice.');
  }

  const invoiceCurrency = milestone.currency || order.currency || 'USD';
  let inheritedFxRate = 1;
  if (invoiceCurrency !== 'USD') {
    const { data: latestFxInv } = await admin
      .from('invoices')
      .select('fx_rate_to_usd')
      .eq('order_id', order.id)
      .eq('currency', invoiceCurrency)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestFxInv?.fx_rate_to_usd && Number(latestFxInv.fx_rate_to_usd) > 0) {
      inheritedFxRate = Number(latestFxInv.fx_rate_to_usd);
    }
  }

  const { data: rpcRes, error } = await admin.rpc('create_draft_invoice_multi_atomic', {
    p_client_id: order.client_id,
    p_order_id: order.id,
    p_milestone_id: milestone.id,
    p_currency: invoiceCurrency,
    p_fx_rate_to_usd: inheritedFxRate,
    p_discount_cents: 0,
    p_tax_rate_bps: 0,
    p_due_days: 7,
    p_payment_instructions: null,
    p_notes: `Milestone invoice for ${order.code}: ${milestone.title}`,
    p_items: [
      {
        description: `${order.code} — ${milestone.title}`,
        qty: 1,
        quantity: 1,
        unit_price_cents: milestone.amount_cents,
      },
    ] as unknown as Json,
    p_issue_immediately: true,
    p_admin_id: session.userId,
  });
  if (error) throw new Error(error.message);

  const created =
    rpcRes && typeof rpcRes === 'object' && !Array.isArray(rpcRes)
      ? (rpcRes as { invoice_id?: string; code?: string })
      : null;

  const displayAmount = (milestone.amount_cents / 100).toLocaleString();
  await createInAppNotification({
    recipientId: order.client_id,
    category: 'invoice',
    title: `Milestone Invoice Issued: ${created?.code ?? ''}`,
    body: `${milestone.title} (${milestone.currency} ${displayAmount})`,
    href: `/portal/invoices/${created?.invoice_id ?? ''}`,
  });

  const clientEmail = await lookupProfileEmail(order.client_id);
  if (clientEmail && created?.invoice_id) {
    await enqueueTransactionalEmail({
      toEmail: clientEmail,
      template: 'invoice_issued',
      subject: `Milestone Invoice ${created.code ?? ''} — ${milestone.title}`,
      payload: {
        message: `An invoice (${created.code ?? ''}) for milestone "${milestone.title}" (${milestone.currency} ${displayAmount}) on order ${order.code} is ready in your Client Portal.`,
        actionUrl: `${getSiteOrigin()}/portal/invoices/${created.invoice_id}`,
      },
      entityType: 'invoice',
      entityId: created.invoice_id,
    });
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath('/admin/invoices');
  revalidatePath('/admin/billing');
  revalidatePath('/portal/invoices');
}

export async function toggleOrderRequirementsLockAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const lock = parseFormBoolean(formData, 'lock');
  if (!orderId) return;

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('client_id, code')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) throw new Error('Order not found.');

  const verifiedAt = lock ? new Date().toISOString() : null;
  const { data: existing } = await admin
    .from('order_requirements')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from('order_requirements')
      .update({ verified_by_admin_at: verifiedAt })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from('order_requirements').insert({
      order_id: orderId,
      client_id: order.client_id,
      verified_by_admin_at: verifiedAt,
    });
    if (error) throw new Error(error.message);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId: order.client_id,
    orderId,
    action: lock ? 'order.requirements_locked' : 'order.requirements_unlocked',
    entityType: 'order_requirements',
    summary: `${lock ? 'Locked and verified' : 'Unlocked'} order ${order.code} requirements`,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
}

export async function attachOrderRequirementFileAction(formData: FormData): Promise<void> {
  const session = await requireAuthenticatedSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  if (!orderId) return;

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('client_id, code')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) throw new Error('Order not found.');
  if (session.role !== 'admin' && order.client_id !== session.userId) {
    throw new Error('Forbidden.');
  }

  if (session.role !== 'admin') {
    const { data: req } = await admin
      .from('order_requirements')
      .select('verified_by_admin_at')
      .eq('order_id', orderId)
      .maybeSingle();
    if (req?.verified_by_admin_at) {
      throw new Error('Verified requirements are locked and cannot receive new uploads.');
    }
  }

  const fileId = await registerVaultAttachmentFromForm(admin, {
    formData,
    ownerClientId: order.client_id,
    uploadedBy: session.userId,
    category: 'requirement_attachment',
    orderId,
  });
  if (!fileId) {
    throw new Error('Select and finish uploading a file first.');
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: session.role === 'admin' ? 'admin' : 'client',
    clientId: order.client_id,
    orderId,
    action: 'order.requirement_file_attached',
    entityType: 'vault_file',
    entityId: fileId,
    summary: `Attached file to ${order.code} requirements`,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath('/portal/files');
}

export async function deleteOrderTaskAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const taskId = String(formData.get('task_id') ?? '').trim();
  const orderId = String(formData.get('order_id') ?? '').trim();
  if (!taskId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('order_tasks').delete().eq('id', taskId);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    orderId: orderId || null,
    action: 'order.task_deleted',
    entityType: 'order_task',
    entityId: taskId,
    summary: 'Deleted order task',
  });

  if (orderId) {
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/portal/orders/${orderId}`);
  }
}

export async function deleteDeliverableOrVaultFileAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const deliverableId = String(formData.get('deliverable_id') ?? '').trim() || null;
  const vaultFileId = String(formData.get('vault_file_id') ?? '').trim() || null;
  const orderId = String(formData.get('order_id') ?? '').trim() || null;

  if (!deliverableId && !vaultFileId) return;

  const admin = getSupabaseAdmin();
  const keysToDelete: string[] = [];

  if (deliverableId) {
    const { data: deliv } = await admin
      .from('deliverables')
      .select('id, status, order_id, title')
      .eq('id', deliverableId)
      .maybeSingle();
    if (!deliv) throw new Error('Deliverable not found.');
    if (deliv.status === 'accepted') {
      throw new Error('Client-accepted deliverables cannot be deleted.');
    }

    const { data: files } = await admin
      .from('vault_files')
      .select('id, r2_key')
      .eq('deliverable_id', deliverableId);
    for (const f of files ?? []) {
      keysToDelete.push(f.r2_key);
    }

    if (keysToDelete.length > 0 && isR2Configured()) {
      await deletePrivateObjects(keysToDelete);
    }

    await admin.from('vault_files').delete().eq('deliverable_id', deliverableId);
    const { error } = await admin.from('deliverables').delete().eq('id', deliverableId);
    if (error) throw new Error(error.message);

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'admin',
      orderId: deliv.order_id,
      action: 'deliverable.deleted',
      entityType: 'deliverable',
      entityId: deliverableId,
      summary: `Deleted unaccepted deliverable "${deliv.title}"`,
    });
  } else if (vaultFileId) {
    const { data: vFile } = await admin
      .from('vault_files')
      .select('id, r2_key, filename, order_id, deliverable_id, owner_client_id')
      .eq('id', vaultFileId)
      .maybeSingle();
    if (!vFile) throw new Error('Vault file not found.');
    if (vFile.deliverable_id) {
      throw new Error('Delete the parent deliverable instead of detaching its file directly.');
    }

    if (isR2Configured()) {
      await deletePrivateObjects([vFile.r2_key]);
    }
    const { error } = await admin.from('vault_files').delete().eq('id', vaultFileId);
    if (error) throw new Error(error.message);

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'admin',
      clientId: vFile.owner_client_id,
      orderId: vFile.order_id,
      action: 'vault_file.deleted',
      entityType: 'vault_file',
      entityId: vaultFileId,
      summary: `Deleted vault file "${vFile.filename}"`,
    });
  }

  if (orderId) {
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/portal/orders/${orderId}`);
  }
  revalidatePath('/admin/recovery');
  revalidatePath('/portal/files');
}

const ALLOWED_NOTE_TYPES = new Set(['general', 'call_log', 'followup', 'preference']);

export async function addTypedClientNoteAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const rawNoteType = String(formData.get('note_type') ?? 'general').trim();
  const normalizedNoteType = rawNoteType === 'call' ? 'call_log' : rawNoteType;
  const noteType = ALLOWED_NOTE_TYPES.has(normalizedNoteType) ? normalizedNoteType : 'general';
  const isPinned = parseFormBoolean(formData, 'is_pinned');
  const followupDate = String(formData.get('followup_date') ?? '').trim() || null;

  if (!clientId || !body) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('client_notes').insert({
    client_id: clientId,
    author_id: session.userId,
    body,
    note_type: noteType,
    is_pinned: isPinned,
    followup_date: followupDate,
  });
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId,
    action: 'client.note_added',
    entityType: 'client_note',
    summary: `Added ${noteType} note on client record`,
    metadata: { noteType, isPinned, followupDate },
  });

  revalidatePath(`/admin/clients/${clientId}`);
}
