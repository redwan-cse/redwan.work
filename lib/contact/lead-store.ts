import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { ConsentedLead } from '@/lib/contact/consent-intake';

export async function insertLead(
  lead: ConsentedLead
): Promise<
  | { ok: true; ticketRef: string }
  | { ok: false; error: string; code?: 'consent_stale' | 'consent_unavailable' }
> {
  try {
    const admin = getSupabaseAdmin();
    const { attachments, ...inquiryFields } = lead;

    const { data, error } = await admin
      .from('inquiries')
      .insert({
        name: inquiryFields.name,
        email: inquiryFields.email,
        country: inquiryFields.country,
        whatsapp_e164: inquiryFields.whatsapp_e164,
        preferred_contact_method: inquiryFields.preferred_contact_method,
        timezone: inquiryFields.timezone,
        preferred_contact_date: inquiryFields.preferred_contact_date,
        best_time_to_contact: inquiryFields.best_time_to_contact,
        services: inquiryFields.services,
        company: inquiryFields.company,
        project_url: inquiryFields.project_url,
        project_summary: inquiryFields.project_summary,
        nda_required: inquiryFields.nda_required,
        urgency: inquiryFields.urgency,
        budget_min: inquiryFields.budget_min,
        budget_max: inquiryFields.budget_max,
        how_found: inquiryFields.how_found,
        source_page: inquiryFields.source_page,
        device_type: inquiryFields.device_type,
        user_agent: inquiryFields.user_agent,
        ip_hash: inquiryFields.ip_hash,
        consent_at: inquiryFields.consent_at,
        consent_policy_version: inquiryFields.consent_policy_version,
        consent_policy_hash: inquiryFields.consent_policy_hash,
        consent_capture_method: inquiryFields.consent_capture_method,
      })
      .select('id, code, ticket_number')
      .single();

    if (error?.code === 'PT409') {
      return { ok: false, error: 'Current consent required.', code: 'consent_stale' };
    }
    if (error?.code === 'PT503') {
      return { ok: false, error: 'Consent unavailable.', code: 'consent_unavailable' };
    }
    if (error || !data || !Number.isSafeInteger(data.ticket_number) || data.ticket_number < 1) {
      throw new Error('Inquiry persistence unavailable');
    }

    if (attachments.length > 0) {
      const attachmentRows = attachments.map((att) => ({
        inquiry_id: data.id,
        r2_key: att.key,
        filename: att.filename,
        mime: att.mime,
        size_bytes: att.size_bytes,
      }));
      await admin.from('inquiry_attachments').insert(attachmentRows);
    }

    return { ok: true, ticketRef: data.code ?? `INQ-${data.ticket_number}` };
  } catch {
    console.error('Inquiry insert failed.');
    return { ok: false, error: 'Could not save your message.' };
  }
}
