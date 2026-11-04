import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

export interface AuditEventInput {
  actorId?: string | null;
  actorRole?: 'admin' | 'client' | 'system';
  clientId?: string | null;
  orderId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}

export async function recordAuditLog(input: AuditEventInput): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.from('audit_logs').insert({
      actor_id: input.actorId ?? null,
      actor_role: input.actorRole ?? 'system',
      client_id: input.clientId ?? null,
      order_id: input.orderId ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary,
      metadata: (input.metadata ?? {}) as Json,
    });
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}

export interface NotificationInput {
  recipientId: string;
  category?: string;
  title: string;
  body: string;
  href?: string | null;
}

export async function createInAppNotification(input: NotificationInput): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.from('notifications').insert({
      recipient_id: input.recipientId,
      category: input.category ?? 'general',
      title: input.title,
      body: input.body,
      href: input.href ?? null,
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

export async function notifyAllAdmins(input: Omit<NotificationInput, 'recipientId'>): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const { data: admins } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true);

    if (!admins?.length) return;
    await admin.from('notifications').insert(
      admins.map((a) => ({
        recipient_id: a.id,
        category: input.category ?? 'general',
        title: input.title,
        body: input.body,
        href: input.href ?? null,
      }))
    );
  } catch (err) {
    console.error('Failed to notify admins:', err);
  }
}

export interface QueueEmailInput {
  toEmail: string;
  template: string;
  subject: string;
  payload?: Record<string, unknown>;
  entityType?: string | null;
  entityId?: string | null;
}

export async function enqueueTransactionalEmail(input: QueueEmailInput): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.from('email_outbox').insert({
      to_email: input.toEmail,
      template: input.template,
      subject: input.subject,
      payload: (input.payload ?? {}) as Json,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
    });
  } catch (err) {
    console.error('Failed to enqueue transactional email:', err);
  }
}
