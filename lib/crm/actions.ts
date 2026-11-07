'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createInAppNotification,
  enqueueTransactionalEmail,
  notifyAllAdmins,
  recordAuditLog,
} from '@/lib/crm/audit';
import { type ServicePillarKey } from '@/lib/content/site';
import { getPublicServicesCatalog } from '@/lib/cms/queries';
import { parseFormBoolean } from '@/lib/forms/boolean';
import type { Database } from '@/lib/supabase/database.types';

type OrderStatus = Database['public']['Enums']['order_status'];
type InquiryStatus = Database['public']['Enums']['inquiry_status'];
type ClientTier = Database['public']['Enums']['client_tier'];
type PaymentMethod = Database['public']['Enums']['payment_method'];
type TicketPriority = Database['public']['Enums']['ticket_priority'];
type TicketStatus = Database['public']['Enums']['ticket_status'];

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

  if (!clientId) {
    const siteOrigin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000';
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
  const requiresRoe = formData.get('requires_roe') === 'on' || pillar === 'cybersecurity';
  const clientId = String(formData.get('client_id') ?? '').trim() || null;
  const inquiryId = String(formData.get('inquiry_id') ?? '').trim() || null;

  if (!recipientEmail || ! recipientName || !title || !executiveSummary || totalUsd <= 0) {
    return;
  }

  const totalCents = Math.round(totalUsd * 100);
  const scopeItems = scopeItemsRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const admin = getSupabaseAdmin();
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
  const depositCents = Math.round((totalCents * depositPercent) / 100);
  const balanceCents = Math.max(0, totalCents - depositCents);
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
  const depositPercent = Number(formData.get('deposit_percent') ?? 50);
  const requiresRoe = formData.get('requires_roe') === 'on';
  const dueDays = Number(formData.get('due_days') ?? 10);

  if (!clientId || !title || totalUsd < 0) return;

  const totalCents = Math.round(totalUsd * 100);
  const admin = getSupabaseAdmin();

  const initialStatus: OrderStatus =
    depositPercent > 0 ? 'awaiting_payment' : 'pending_requirements';

  const dueAt = new Date(Date.now() + Math.max(1, dueDays) * 86400 * 1000).toISOString();

  const { data: order } = await admin
    .from('orders')
    .insert({
      client_id: clientId,
      title,
      description,
      pillar,
      pricing_model: 'fixed_package',
      status: initialStatus,
      requires_roe: requiresRoe,
      currency: 'USD',
      subtotal_cents: totalCents,
      total_cents: totalCents,
      deposit_percent: depositPercent,
      due_at: dueAt,
    })
    .select('id, code')
    .single();

  if (order) {
    await admin.from('order_milestones').insert([
      {
        order_id: order.id,
        position: 0,
        title: 'Kickoff & Scope Alignment',
        weight_percent: 30,
        amount_cents: Math.round(totalCents * 0.3),
        status: 'in_progress',
      },
      {
        order_id: order.id,
        position: 1,
        title: 'Core Execution & Verification',
        weight_percent: 50,
        amount_cents: Math.round(totalCents * 0.5),
        status: 'pending',
      },
      {
        order_id: order.id,
        position: 2,
        title: 'Final Deliverable Handover & Sign-Off',
        weight_percent: 20,
        amount_cents: Math.round(totalCents * 0.2),
        status: 'pending',
      },
    ]);

    if (depositPercent > 0 && totalCents > 0) {
      const depositCents = Math.round((totalCents * depositPercent) / 100);
      const { data: inv } = await admin
        .from('invoices')
        .insert({
          client_id: clientId,
          order_id: order.id,
          status: 'issued',
          is_deposit_invoice: true,
          currency: 'USD',
          fx_rate_to_usd: 1,
          subtotal_cents: depositCents,
          total_cents: depositCents,
          issued_at: new Date().toISOString(),
          due_at: new Date(Date.now() + 5 * 86400 * 1000).toISOString(),
          notes: `Kickoff deposit (${depositPercent}%) for ${order.code}: ${title}`,
        })
        .select('id')
        .single();

      if (inv) {
        await admin.from('invoice_items').insert({
          invoice_id: inv.id,
          position: 0,
          description: `Kickoff Deposit (${depositPercent}%) — ${order.code}: ${title}`,
          qty: 1,
          unit_price_cents: depositCents,
        });
      }
    }

    await createInAppNotification({
      recipientId: clientId,
      category: 'order',
      title: `New Order Created: ${order.code}`,
      body: title,
      href: `/portal/orders/${order.id}`,
    });

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'admin',
      clientId,
      orderId: order.id,
      action: 'order.created',
      entityType: 'order',
      entityId: order.id,
      summary: `Created order ${order.code}: ${title}`,
      metadata: { totalCents, pillar, initialStatus },
    });
  }

  revalidatePath('/admin/orders');
  revalidatePath('/portal/orders');
}

export async function updateOrderStatusAndProgressAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const orderId = String(formData.get('order_id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim() as OrderStatus;
  const progressPercent = Number(formData.get('progress_percent') ?? 0);

  if (!orderId || !status) return;

  const admin = getSupabaseAdmin();
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
    session.role === 'admin' && formData.get('is_internal_note') === 'on';

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
    } else {
      await notifyAllAdmins({
        category: 'message',
        title: `Client reply on ${order.code}`,
        body: body.slice(0, 120),
        href: `/admin/orders/${orderId}`,
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
  const dueDays = Number(formData.get('due_days') ?? 7);
  const notes = String(formData.get('notes') ?? '').trim() || null;
  const isDeposit = formData.get('is_deposit_invoice') === 'on';

  if (!clientId || !description || amountMajor <= 0) return;

  const totalCents = Math.round(amountMajor * 100);
  const admin = getSupabaseAdmin();

  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .insert({
      client_id: clientId,
      order_id: orderId,
      status: 'issued',
      is_deposit_invoice: isDeposit,
      currency,
      fx_rate_to_usd: fxRate,
      subtotal_cents: totalCents,
      total_cents: totalCents,
      issued_at: new Date().toISOString(),
      due_at: new Date(Date.now() + Math.max(1, dueDays) * 86400 * 1000).toISOString(),
      notes,
    })
    .select('id, code')
    .single();
  if (invErr || !invoice) {
    throw new Error(invErr?.message ?? 'Could not issue invoice.');
  }

  const { error: itemErr } = await admin.from('invoice_items').insert({
    invoice_id: invoice.id,
    position: 0,
    description,
    qty: 1,
    unit_price_cents: totalCents,
  });
  if (itemErr) {
    throw new Error(itemErr.message);
  }

  if (invoice) {

    await createInAppNotification({
      recipientId: clientId,
      category: 'invoice',
      title: `Invoice Issued: ${invoice.code}`,
      body: `${description} (${currency} ${amountMajor.toLocaleString()})`,
      href: `/portal/invoices/${invoice.id}`,
    });

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'admin',
      clientId,
      orderId,
      action: 'invoice.issued',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: `Issued invoice ${invoice.code} for ${currency} ${amountMajor.toLocaleString()}`,
      metadata: { currency, totalCents, fxRate },
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

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath('/admin/clients');
}

export async function replyTicketAction(formData: FormData): Promise<void> {
  const session = await requireAuthenticatedSession();
  const ticketId = String(formData.get('ticket_id') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const isInternalNote =
    session.role === 'admin' && formData.get('is_internal_note') === 'on';

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

  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath('/admin/tickets');
  revalidatePath(`/portal/tickets/${ticketId}`);
  revalidatePath('/portal/tickets');
}

export async function updateTicketStatusAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const ticketId = String(formData.get('ticket_id') ?? '').trim();
  const status = String(formData.get('status') ?? 'resolved').trim() as TicketStatus;
  if (!ticketId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('tickets')
    .update({
      status,
      resolved_at: status === 'resolved' || status === 'closed' ? new Date().toISOString() : null,
    })
    .eq('id', ticketId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath('/admin/tickets');
  revalidatePath(`/portal/tickets/${ticketId}`);
}

export async function toggleReviewPublicApprovalAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const reviewId = String(formData.get('review_id') ?? '').trim();
  const approved = formData.get('is_public_approved') === 'true';
  if (!reviewId) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('client_reviews')
    .update({ is_public_approved: approved })
    .eq('id', reviewId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/reviews');
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

  const initialStatus: OrderStatus =
    depositPercent > 0 ? 'awaiting_payment' : 'pending_requirements';

  const dueAt = new Date(
    Date.now() + Math.max(1, finalDeliveryDays) * 86400 * 1000
  ).toISOString();

  const { data: order, error } = await admin
    .from('orders')
    .insert({
      client_id: session.userId,
      service_id: serviceItem.id.length === 36 ? serviceItem.id : null,
      title: finalTitle,
      description: projectNotes || pkg?.summary || serviceItem.tagline,
      pillar: serviceItem.pillar,
      pricing_model: isCustomDeal ? 'custom_milestone' : 'fixed_package',
      status: initialStatus,
      requires_roe: serviceItem.requiresRoe,
      revisions_included: revisionsIncluded,
      currency: 'USD',
      subtotal_cents: finalPriceCents,
      total_cents: finalPriceCents,
      deposit_percent: depositPercent,
      due_at: dueAt,
      is_custom_deal: isCustomDeal,
      proposed_budget_cents: isCustomDeal ? finalPriceCents : null,
      proposed_delivery_days: isCustomDeal ? finalDeliveryDays : null,
    })
    .select('id, code')
    .single();

  if (error || !order) {
    throw new Error(error?.message ?? 'Could not place order.');
  }

  if (targetScope || projectNotes) {
    await admin.from('order_requirements').upsert({
      order_id: order.id,
      client_id: session.userId,
      target_scope_notes: targetScope || projectNotes,
      responses: {
        service_slug: serviceItem.slug,
        package_tier: isCustomDeal ? 'custom' : (pkg?.tier ?? tier),
        is_custom_deal: isCustomDeal,
        proposed_budget_cents: isCustomDeal ? finalPriceCents : null,
        proposed_delivery_days: isCustomDeal ? finalDeliveryDays : null,
      },
    });
  }

  // Create milestones
  const milestoneFeatures =
    pkg && pkg.features.length > 0
      ? pkg.features
      : [
          'Scope & Architecture Alignment',
          'Core Execution & Implementation',
          'Verification & Final Delivery Sign-Off',
        ];

  await admin.from('order_milestones').insert(
    milestoneFeatures.map((feat, idx) => ({
      order_id: order.id,
      position: idx,
      title: feat,
      weight_percent: Math.round(100 / Math.max(1, milestoneFeatures.length)),
      amount_cents: Math.round(finalPriceCents / Math.max(1, milestoneFeatures.length)),
      status: idx === 0 ? 'in_progress' : 'pending',
    }))
  );

  // Start the live contract chat thread automatically
  await admin.from('order_messages').insert({
    order_id: order.id,
    author_id: session.userId,
    body: isCustomDeal
      ? `Started Custom Deal Contract (${order.code}) with proposed budget $${(finalPriceCents / 100).toLocaleString()} USD and ${finalDeliveryDays}-day timeline.\n\nScope: ${projectNotes || targetScope || finalTitle}`
      : `Started Package Contract (${order.code}): ${finalTitle}.\n\nScope: ${projectNotes || targetScope || pkg?.summary || serviceItem.tagline}`,
    is_internal_note: false,
  });

  // Issue kickoff deposit invoice
  if (depositPercent > 0 && finalPriceCents > 0) {
    const depositCents = Math.round((finalPriceCents * depositPercent) / 100);
    const { data: inv } = await admin
      .from('invoices')
      .insert({
        client_id: session.userId,
        order_id: order.id,
        status: 'issued',
        is_deposit_invoice: true,
        currency: 'USD',
        fx_rate_to_usd: 1,
        subtotal_cents: depositCents,
        total_cents: depositCents,
        issued_at: new Date().toISOString(),
        due_at: new Date(Date.now() + 5 * 86400 * 1000).toISOString(),
        notes: `Kickoff Deposit (${depositPercent}%) for ${order.code}: ${finalTitle}`,
      })
      .select('id')
      .single();

    if (inv) {
      await admin.from('invoice_items').insert({
        invoice_id: inv.id,
        position: 0,
        description: `${isCustomDeal ? 'Custom Deal' : (pkg?.name ?? 'Package')} (${depositPercent}% Kickoff Deposit) — ${order.code}`,
        qty: 1,
        unit_price_cents: depositCents,
      });
    }
  }

  await notifyAllAdmins({
    category: 'order',
    title: isCustomDeal
      ? `New Custom Deal Contract ${order.code}`
      : `New Client Order ${order.code}`,
    body: `${session.email} initiated ${finalTitle} ($${(finalPriceCents / 100).toLocaleString()} USD)`,
    href: `/admin/orders/${order.id}`,
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

  if (orderId) {
    revalidatePath(`/portal/orders/${orderId}`);
    revalidatePath(`/admin/orders/${orderId}`);
  }
  revalidatePath('/portal/orders');
  revalidatePath('/admin/orders');
}

export async function submitInvoicePaymentProofAction(formData: FormData): Promise<void> {
  const session = await requireClientSession();
  const invoiceId = String(formData.get('invoice_id') ?? '').trim();
  const method = (String(formData.get('method') ?? 'bank_transfer').trim() ||
    'bank_transfer') as PaymentMethod;
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
    .select('id, code, client_id, order_id, currency, fx_rate_to_usd, status')
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

  let proofFileId: string | null = null;
  if (r2Key && filename && sizeBytes > 0) {
    const expectedPrefix = `private/${session.userId}/payment_proof/`;
    if (!r2Key.startsWith(expectedPrefix) || r2Key.includes('..')) {
      throw new Error('Invalid payment proof storage key prefix.');
    }

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
        uploaded_by: session.userId,
      })
      .select('id')
      .single();
    if (fileErr || !vFile) {
      throw new Error(fileErr?.message ?? 'Could not register payment proof file.');
    }
    proofFileId = vFile.id;
  }

  const amountCents = Math.round(amountMajor * 100);
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

  revalidatePath('/portal/profile');
}
