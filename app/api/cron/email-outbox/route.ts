import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireBearer } from '@/lib/auth/bearer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!requireBearer(process.env.CRON_SECRET, request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Md Redwan Ahmed <noreply@redwan.work>';
  const replyTo = process.env.RESEND_REPLY_TO || 'contact@redwan.work';

  if (!apiKey) {
    return NextResponse.json({ error: 'Resend API key not configured' }, { status: 503 });
  }

  const resend = new Resend(apiKey);
  const admin = getSupabaseAdmin();

  const { data: pending } = await admin
    .from('email_outbox')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(20);

  let sentCount = 0;
  let failedCount = 0;

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

      const response = await resend.emails.send({
        from: fromEmail,
        to: item.to_email,
        replyTo,
        subject: item.subject,
        html: htmlBody,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const nowIso = new Date().toISOString();
      await admin
        .from('email_outbox')
        .update({
          status: 'sent',
          resend_id: response.data?.id ?? null,
          sent_at: nowIso,
          attempts: item.attempts + 1,
        })
        .eq('id', item.id);

      await admin.from('email_log').insert({
        to_email: item.to_email,
        template: item.template,
        subject: item.subject,
        resend_id: response.data?.id ?? null,
        status: 'sent',
        entity_type: item.entity_type,
        entity_id: item.entity_id,
      });

      sentCount++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Send failed';
      const nextAttempts = item.attempts + 1;
      const backoffMinutes = Math.min(60, Math.pow(2, nextAttempts));
      const nextTry = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

      await admin
        .from('email_outbox')
        .update({
          status: nextAttempts >= 5 ? 'failed' : 'pending',
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

      failedCount++;
    }
  }

  return NextResponse.json({ ok: true, sentCount, failedCount });
}
