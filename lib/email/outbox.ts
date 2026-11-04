import 'server-only';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function drainEmailOutbox(
  limit = 5
): Promise<{ accepted: number; deferred: number; failed: number }> {
  const counts = { accepted: 0, deferred: 0, failed: 0 };
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Md Redwan Ahmed <noreply@redwan.work>';
  const replyTo = process.env.RESEND_REPLY_TO || 'contact@redwan.work';

  if (!apiKey) return counts;

  const resend = new Resend(apiKey);
  const admin = getSupabaseAdmin();

  const { data: pending } = await admin
    .from('email_outbox')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);

  for (const item of pending ?? []) {
    try {
      const payload = (item.payload ?? {}) as Record<string, unknown>;
      const htmlBody =
        typeof payload.html === 'string'
          ? payload.html
          : `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
              <h2 style="margin-top:0;color:#111827;">${item.subject}</h2>
              <p style="color:#374151;line-height:1.6;">${String(payload.message ?? 'You have a new update in your redwan.work Client Portal.')}</p>
              ${payload.actionUrl ? `<p style="margin-top:20px;"><a href="${String(payload.actionUrl)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Open Client Portal</a></p>` : ''}
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
              <p style="font-size:12px;color:#6b7280;">Md Redwan Ahmed · C|EH Certified Consultant · redwan.work</p>
            </div>`;

      const res = await resend.emails.send({
        from: fromEmail,
        to: item.to_email,
        replyTo,
        subject: item.subject,
        html: htmlBody,
      });

      if (res.error) throw new Error(res.error.message);

      const nowIso = new Date().toISOString();
      await admin
        .from('email_outbox')
        .update({
          status: 'sent',
          resend_id: res.data?.id ?? null,
          sent_at: nowIso,
          attempts: item.attempts + 1,
        })
        .eq('id', item.id);

      await admin.from('email_log').insert({
        to_email: item.to_email,
        template: item.template,
        subject: item.subject,
        resend_id: res.data?.id ?? null,
        status: 'sent',
        entity_type: item.entity_type,
        entity_id: item.entity_id,
      });

      counts.accepted++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Send failed';
      const nextAttempts = item.attempts + 1;
      const isFinal = nextAttempts >= 5;
      const nextTry = new Date(
        Date.now() + Math.min(60, Math.pow(2, nextAttempts)) * 60 * 1000
      ).toISOString();

      await admin
        .from('email_outbox')
        .update({
          status: isFinal ? 'failed' : 'pending',
          attempts: nextAttempts,
          last_error: errMsg,
          next_attempt_at: nextTry,
        })
        .eq('id', item.id);

      if (isFinal) counts.failed++;
      else counts.deferred++;
    }
  }

  return counts;
}
