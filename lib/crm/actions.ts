'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isR2Configured, verifyStoredPortalObjectSize } from '@/lib/r2';
import {
  createInAppNotification,
  enqueueTransactionalEmail,
  notifyAllAdmins,
  recordAuditLog,
} from '@/lib/crm/audit';
import { type ServicePillarKey } from '@/lib/content/site';
import { getPublicServicesCatalog } from '@/lib/cms/queries';
import { parseFormBoolean } from '@/lib/forms/boolean';
import {
  computeDepositSplit,
  computeInvoiceTotals,
  validatePaymentSubmission,
} from '@/lib/finance/invariants';
import type { Database } from '@/lib/supabase/database.types';

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
  return process.env.CONTACT_ALERT_TO || process.env.ADMIN_ALERT_EMAIL || 'mail@redwan.work';
}

function getSiteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://redwan.work';
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
  const requiresRoe = parseFormBoolean(formData, 'requires_roe');
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
      status: 'sent',
      valid_until: new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10),
      created_by: session.userId,
    })
    .select('id, code')
    .single();
  if (propErr || !proposal) {
    throw new Error(propErr?.message ?? 'Could not create proposal.');
  }

  // Default 2 milestones (Kickoff & Final Delivery)
  const boundedDepositPercent = Math.min(100, Math.max(0, Math.round(depositPercent)));
  const { depositCents, balanceCents } = computeDepositSplit(totalCents, boundedDepositPercent);
  const { error: msErr } = await admin.from('proposal_milestones').insert([
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
  ]);
  if (msErr) {
    throw new Error(msErr.message);
  }

  if (proposal) {

    if (clientId) {
      await createInAppNotification({
        recipientId: clientId,
        category: 'proposal',
        title: `New Proposal ${proposal.code ?? ''}: ${title}`,
        body: 'Review and accept your project proposal in the Client Portal.',
        href: '/portal/proposals',
      });
    }

    await enqueueTransactionalEmail({
      toEmail: recipientEmail,
      template: 'proposal_sent',
      subject: `Proposal ${proposal.code ?? ''} — ${title}`,
      payload: {
        message: `Hi ${recipientName}, a new project proposal (${proposal.code ?? ''}: ${title}) for $${totalUsd.toLocaleString()} USD is ready for your review in the redwan.work Client Portal.`,
        actionUrl: `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://redwan.work'}/portal/proposals`,
      },
      entityType: 'proposal',
      entityId: proposal.id,
    });

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'admin',
      clientId,
      action: 'proposal.sent',
      entityType: 'proposal',
      entityId: proposal.id,
      summary: `Sent proposal ${proposal.code ?? ''} (${title}) to ${recipientEmail}`,
      metadata: { totalCents, pillar },
    });
  }

  revalidatePath('/admin/proposals');
  revalidatePath('/portal/proposals');
}

export async function createOrderFromAdminAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const pillar = (String(formData.get('pillar') ?? 'cybersecurity').trim() ||
    'cybersecurity') as ServicePillarKey;
  const totalUsd = Number(formData.get('total_usd') ?? 0);
  const depositPercent = Math.min(100, Math.max(0, Math.round(Number(formData.get('deposit_percent') ?? 50))));
  const requiresRoe = parseFormBoolean(formData, 'requires_roe') || pillar === 'cybersecurity';
  const dueDays = Math.max(1, Math.round(Number(formData.get('due_days') ?? 10)));

  if (!clientId || !title || totalUsd < 0) return;

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
          message: `A new engagement order (${orderCode}: ${title}) for $${totalUsd.toLocaleString()} USD has been initialized in your Client Portal.`,
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
  await requireAdminSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const isClientVisible = parseFormBoolean(formData, 'is_client_visible');

  if (!orderId || !title) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('order_tasks').insert({
    order_id: orderId,
    title,
    is_client_visible: isClientVisible,
  });
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath('/contact');
}

export async function toggleOrderTaskAction(formData: FormData): Promise<void> {
  await requireAdminSession();
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
    .select('code, auto_accept_days, client_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.client_id !== clientId) {
    throw new Error('Order does not match target client.');
  }

  if (r2Key && filename && sizeBytes > 0) {
    const expectedPrefix = `private/${clientId}/deliverable/`;
    if (!r2Key.startsWith(expectedPrefix) || r2Key.includes('..')) {
      throw new Error('Invalid deliverable storage key prefix.');
    }
    if (isR2Configured()) {
      const okSize = await verifyStoredPortalObjectSize(r2Key, sizeBytes);
      if (!okSize) {
        throw new Error('Uploaded deliverable object could not be verified in private storage.');
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

  if (r2Key && filename && sizeBytes > 0) {
    const retentionUntil = new Date(Date.now() + 365 * 86400 * 1000).toISOString();
    const { error: fileErr } = await admin.from('vault_files').insert({
      owner_client_id: clientId,
      order_id: orderId,
      deliverable_id: deliverable.id,
      category: 'deliverable',
      r2_key: r2Key,
      filename,
      mime_type: mime,
      size_bytes: sizeBytes,
      sha256_checksum: sha256Checksum,
      retention_until: retentionUntil,
      uploaded_by: session.userId,
    });
    if (fileErr) {
      throw new Error(fileErr.message);
    }
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

export async function postOrderMessageAction(formData: FormData): Promise<void> {
  const session = await requireAuthenticatedSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const isInternalNote =
    session.role === 'admin' && parseFormBoolean(formData, 'is_internal_note');

  if (!orderId || !body) return;

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('client_id, code, title')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return;
  if (session.role !== 'admin' && order.client_id !== session.userId) {
    throw new Error('Forbidden.');
  }

  const { error: msgErr } = await admin.from('order_messages').insert({
    order_id: orderId,
    author_id: session.userId,
    body,
    is_internal_note: isInternalNote,
  });
  if (msgErr) {
    throw new Error(msgErr.message);
  }

  if (!isInternalNote) {
    if (session.role === 'admin') {
      await createInAppNotification({
        recipientId: order.client_id,
        category: 'message',
        title: `New message on ${order.code}`,
        body: body.slice(0, 120),
        href: `/portal/orders/${orderId}`,
      });
      const clientEmail = await lookupProfileEmail(order.client_id);
      if (clientEmail) {
        await enqueueTransactionalEmail({
          toEmail: clientEmail,
          template: 'order_message',
          subject: `New Message on Order ${order.code} — ${order.title}`,
          payload: {
            message: body.slice(0, 400),
            actionUrl: `${getSiteOrigin()}/portal/orders/${orderId}`,
          },
          entityType: 'order',
          entityId: orderId,
        });
      }
    } else {
      await notifyAllAdmins({
        category: 'message',
        title: `Client reply on ${order.code}`,
        body: body.slice(0, 120),
        href: `/admin/orders/${orderId}`,
      });
      await enqueueTransactionalEmail({
        toEmail: getAdminAlertEmail(),
        template: 'order_message_admin',
        subject: `Client Reply on Order ${order.code} — ${order.title}`,
        payload: {
          message: body.slice(0, 400),
          actionUrl: `${getSiteOrigin()}/admin/orders/${orderId}`,
        },
        entityType: 'order',
        entityId: orderId,
      });
    }
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/portal/orders/${orderId}`);
  revalidatePath('/contact');
}

// =============================================================================
// 3. ADMIN: INVOICES, PAYMENTS, CLIENT CRM & TICKETS
// =============================================================================

export async function createAndIssueInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const orderId = String(formData.get('order_id') ?? '').trim() || null;
  const currency = String(formData.get('currency') ?? 'USD')
    .trim()
    .toUpperCase();
  const fxRate = Number(formData.get('fx_rate_to_usd') ?? 1) || 1;
  const description = String(formData.get('description') ?? '').trim();
  const amountMajor = Number(formData.get('amount_major') ?? 0);
  const discountMajor = Number(formData.get('discount_major') ?? 0);
  const taxRateBps = Math.round(Number(formData.get('tax_rate_bps') ?? 0));
  const dueDays = Math.max(1, Math.round(Number(formData.get('due_days') ?? 7)));
  const notes = String(formData.get('notes') ?? '').trim() || null;
  const isDeposit = parseFormBoolean(formData, 'is_deposit_invoice');

  if (!clientId || !description || amountMajor <= 0) return;

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
  revalidatePath('/portal/invoices');
}

export async function reviewPaymentProofAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const paymentId = String(formData.get('payment_id') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  const fxRate = Number(formData.get('fx_rate') ?? 1) || 1;
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

  const admin = getSupabaseAdmin();
  const { data: ticket } = await admin
    .from('tickets')
    .select('client_id, code, subject')
    .eq('id', ticketId)
    .maybeSingle();

  if (!ticket) return;
  if (session.role !== 'admin' && ticket.client_id !== session.userId) {
    throw new Error('Forbidden.');
  }

  const { error: msgErr } = await admin.from('ticket_messages').insert({
    ticket_id: ticketId,
    author_id: session.userId,
    body,
    is_internal_note: isInternalNote,
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

  revalidatePath('/admin');
  revalidatePath('/portal');
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
  const serviceItem =
    catalog.find((s) => s.slug === serviceSlug) ?? catalog[0];

  const isCustomDeal = tier === 'custom';
  const pkg = !isCustomDeal
    ? serviceItem.packages.find((p) => p.tier === tier) ?? serviceItem.packages[0]
    : undefined;

  const finalPriceCents = isCustomDeal
    ? Math.max(5000, Math.round((customBudgetUsd || serviceItem.startingPriceCents / 100) * 100))
    : (pkg?.priceCents ?? serviceItem.startingPriceCents);

  const finalDeliveryDays = isCustomDeal
    ? Math.max(1, Math.round(customDeliveryDays || 7))
    : (pkg?.deliveryDays ?? 7);

  const depositPercent = isCustomDeal ? 50 : (pkg?.depositPercent ?? 50);
  const revisionsIncluded = isCustomDeal ? 2 : (pkg?.revisions ?? 2);

  const finalTitle =
    projectTitle ||
    (isCustomDeal
      ? `${serviceItem.title} — Custom Deal Offer ($${(finalPriceCents / 100).toLocaleString()})`
      : `${serviceItem.title} — ${pkg?.name ?? 'Standard Package'}`);

  const admin = getSupabaseAdmin();

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
    : `Started Package Contract ({{ORDER_CODE}}): ${finalTitle}.\n\nScope: ${projectNotes || targetScope || pkg?.summary || serviceItem.tagline}`;

  const depositItemLabel = `${isCustomDeal ? 'Custom Deal' : (pkg?.name ?? 'Package')} (${depositPercent}% Kickoff Deposit)`;

  const { data: rpcRes, error } = await admin.rpc('create_package_order_atomic', {
    p_client_id: session.userId,
    p_service_id: serviceItem.id.length === 36 ? serviceItem.id : null,
    p_title: finalTitle,
    p_description: projectNotes || pkg?.summary || serviceItem.tagline,
    p_pillar: serviceItem.pillar,
    p_is_custom_deal: isCustomDeal,
    p_requires_roe: serviceItem.requiresRoe,
    p_revisions_included: revisionsIncluded,
    p_total_cents: finalPriceCents,
    p_deposit_percent: depositPercent,
    p_delivery_days: finalDeliveryDays,
    p_target_scope_notes: targetScope || projectNotes,
    p_requirements_responses: {
      service_slug: serviceItem.slug,
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
      serviceSlug: serviceItem.slug,
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

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('id, client_id, code, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.client_id !== session.userId) {
    throw new Error('Forbidden.');
  }

  const nowIso = new Date().toISOString();
  const windowEnd = new Date(Date.now() + 21 * 86400 * 1000).toISOString();

  const { error: roeErr } = await admin.from('engagement_authorizations').upsert(
    {
      order_id: orderId,
      client_id: session.userId,
      authorized_targets: authorizedTargets,
      excluded_systems: excludedSystems,
      testing_window_start: nowIso,
      testing_window_end: windowEnd,
      emergency_contact_name: emergencyName,
      emergency_contact_phone: emergencyPhone,
      signer_full_name: signerFullName,
      signer_title: signerTitle,
      ownership_attested: true,
      signed_at: nowIso,
    },
    { onConflict: 'order_id' }
  );
  if (roeErr) {
    throw new Error(roeErr.message);
  }

  const { error: orderErr } = await admin
    .from('orders')
    .update({
      roe_signed_at: nowIso,
      nda_accepted_at: nowIso,
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
  const mime = String(formData.get('mime') ?? 'application/pdf').trim();
  const sizeBytes = Number(formData.get('size_bytes') ?? 0);

  if (!invoiceId || !reference || amountMajor <= 0) return;

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
    const expectedPrefix = `private/${session.userId}/payment_proof/`;
    if (!r2Key.startsWith(expectedPrefix) || r2Key.includes('..')) {
      throw new Error('Invalid payment proof storage key prefix.');
    }
    if (isR2Configured()) {
      const okSize = await verifyStoredPortalObjectSize(r2Key, sizeBytes);
      if (!okSize) {
        throw new Error('Uploaded payment proof object could not be verified in private storage.');
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
        mime_type: mime,
        size_bytes: sizeBytes,
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

export async function createClientTicketAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const rawPriority = String(formData.get('priority') ?? 'medium').trim();
  const priority: TicketPriority =
    rawPriority === 'urgent' || rawPriority === 'high' || rawPriority === 'low'
      ? rawPriority
      : 'medium';
  const rawCategory = String(formData.get('category') ?? 'general').trim() || 'general';
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

  const { error: msgErr } = await admin.from('ticket_messages').insert({
    ticket_id: ticket.id,
    author_id: session.userId,
    body,
    is_internal_note: false,
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
  const ratingOverall = Math.min(5, Math.max(1, Number(formData.get('rating_overall') ?? 5)));
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
  const websiteUrl = String(formData.get('website_url') ?? '').trim() || null;
  const taxId = String(formData.get('tax_id') ?? '').trim() || null;
  const preferredCurrency = String(formData.get('preferred_currency') ?? 'USD')
    .trim()
    .toUpperCase();

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

  const { error: cpErr } = await admin.from('client_profiles').upsert({
    user_id: session.userId,
    company_name: companyName,
    company_role: companyRole,
    website_url: websiteUrl,
    tax_id: taxId,
    preferred_currency: preferredCurrency,
  });
  if (cpErr) throw new Error(cpErr.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'client',
    clientId: session.userId,
    action: 'client.profile_updated',
    entityType: 'client',
    entityId: session.userId,
    summary: 'Updated client billing and organization profile',
    metadata: { companyName, preferredCurrency, timezone },
  });

  revalidatePath('/portal/profile');
}
