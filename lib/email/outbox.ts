import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeActionUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return escapeHtml(trimmed);
}

export function renderOutboxHtml(item: {
  subject: string;
  payload: unknown;
}): string {
  const payload =
    item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
      ? (item.payload as Record<string, unknown>)
      : {};

  if (typeof payload.html === 'string' && payload.trustedHtml === true) {
    return payload.html;
  }

  const safeSubject = escapeHtml(String(item.subject ?? 'Portal Notification'));
  const safeMessage = escapeHtml(
    String(payload.message ?? 'You have a new update in your redwan.work Client Portal.')
  );
  const safeActionUrl = sanitizeActionUrl(payload.actionUrl);

  return `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
    <h2 style="margin-top:0;color:#111827;">${safeSubject}</h2>
    <p style="color:#374151;line-height:1.6;white-space:pre-line;">${safeMessage}</p>
    ${
      safeActionUrl
        ? `<p style="margin-top:20px;"><a href="${safeActionUrl}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Open Client Portal</a></p>`
        : ''
    }
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="font-size:12px;color:#6b7280;">Md. Redwan Ahmed &middot; Security &amp; Cloud Engineering &middot; redwan.work</p>
  </div>`;
}

export async function drainEmailOutbox(
  limit = 20
): Promise<{ accepted: number; deferred: number; failed: number }> {
  const counts = { accepted: 0, deferred: 0, failed: 0 };
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Md. Redwan Ahmed <noreply@redwan.work>';
  const replyTo = process.env.RESEND_REPLY_TO || 'contact@redwan.work';
  const baseUrl = (process.env.RESEND_API_BASE_URL || 'https://api.resend.com').replace(
    /\/$/,
    ''
  );
  const baseDelayMs = Math.max(
    50,
    Number(process.env.EMAIL_OUTBOX_BASE_DELAY_MS ?? 120_000) || 120_000
  );

  if (!apiKey) return counts;

  const admin = getSupabaseAdmin();
  const { data: claimed, error: claimErr } = await admin.rpc('claim_pending_email_outbox', {
    p_limit: limit,
    p_stale_seconds: 300,
  });

  if (claimErr) {
    throw new Error(claimErr.message);
  }

  for (const item of claimed ?? []) {
    try {
      const htmlBody = renderOutboxHtml({
        subject: item.subject,
        payload: item.payload,
      });

      const response = await fetch(`${baseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `outbox-${item.id}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [item.to_email],
          reply_to: replyTo,
          subject: item.subject,
          html: htmlBody,
        }),
      });

      const rawText = await response.text();
      let parsedBody: { id?: string; message?: string; error?: string } = {};
      try {
        parsedBody = rawText ? (JSON.parse(rawText) as typeof parsedBody) : {};
      } catch {
        parsedBody = {};
      }

      if (!response.ok) {
        throw new Error(
          parsedBody.message || parsedBody.error || `Resend HTTP ${response.status}`
        );
      }

      const nowIso = new Date().toISOString();
      const { error: updErr } = await admin
        .from('email_outbox')
        .update({
          status: 'sent',
          locked_at: null,
          resend_id: parsedBody.id ?? null,
          sent_at: nowIso,
          attempts: item.attempts + 1,
          last_error: null,
        })
        .eq('id', item.id);
      if (updErr) throw new Error(updErr.message);

      await admin.from('email_log').insert({
        to_email: item.to_email,
        template: item.template,
        subject: item.subject,
        resend_id: parsedBody.id ?? null,
        status: 'sent',
        entity_type: item.entity_type,
        entity_id: item.entity_id,
      });

      counts.accepted++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Send failed';
      const nextAttempts = item.attempts + 1;
      const isFinal = nextAttempts >= 5;
      const delayMs = Math.min(
        3_600_000,
        baseDelayMs * Math.pow(2, Math.max(0, nextAttempts - 1))
      );
      const nextTry = new Date(Date.now() + delayMs).toISOString();

      await admin
        .from('email_outbox')
        .update({
          status: isFinal ? 'failed' : 'pending',
          locked_at: null,
          attempts: nextAttempts,
          last_error: errMsg,
          next_attempt_at: nextTry,
        })
        .eq('id', item.id);

      await admin.from('email_log').insert({
        to_email: item.to_email,
        template: item.template,
        subject: item.subject,
        status: 'failed',
        error: errMsg,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
      });

      if (isFinal) counts.failed++;
      else counts.deferred++;
    }
  }

  return counts;
}
