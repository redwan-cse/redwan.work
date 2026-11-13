import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { enqueueTransactionalEmail, notifyAllAdmins } from '@/lib/crm/audit';
import { SERVICE_CATALOG, type ServicePillarKey } from '@/lib/content/site';
import type { ConsentedLead } from '@/lib/contact/consent-intake';

export function deriveInquiryPillar(services: string[]): ServicePillarKey {
  for (const raw of services) {
    const normalized = raw.trim().toLowerCase();
    const matched = SERVICE_CATALOG.find(
      (s) => s.title.toLowerCase() === normalized || s.slug.toLowerCase() === normalized
    );
    if (matched) return matched.pillar;
    if (/full-stack|web|nextjs|next\.js|software|api|saas|development/.test(normalized)) {
      return 'development';
    }
    if (/cloud|devops|linux|siem|wazuh|docker|aws|azure|server/.test(normalized)) {
      return 'cloud_devops';
    }
    if (/ai|ml|machine learning|llm|automation/.test(normalized)) {
      return 'ai_ml';
    }
    if (/support|recovery|retainer|helpdesk|advisory/.test(normalized)) {
      return 'tech_support';
    }
    if (/vapt|penetration|security|osint|cyber|audit/.test(normalized)) {
      return 'cybersecurity';
    }
  }
  return 'cybersecurity';
}

export async function insertLead(
  lead: ConsentedLead
): Promise<
  | { ok: true; ticketRef: string }
  | { ok: false; error: string; code?: 'consent_stale' | 'consent_unavailable' }
> {
  try {
    const admin = getSupabaseAdmin();
    const { attachments, ...inquiryFields } = lead;
    const servicePillar = deriveInquiryPillar(inquiryFields.services);

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
        service_pillar: servicePillar,
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
      const { error: attErr } = await admin.from('inquiry_attachments').insert(attachmentRows);
      if (attErr) {
        await admin.from('inquiries').delete().eq('id', data.id);
        throw new Error('Inquiry attachment persistence failed');
      }
    }

    const ticketRef = data.code ?? `INQ-${data.ticket_number}`;
    const siteOrigin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://redwan.work';
    const adminEmail =
      process.env.CONTACT_ALERT_TO || process.env.ADMIN_ALERT_EMAIL || 'contact@redwan.work';

    await notifyAllAdmins({
      category: 'inquiry',
      title: `New Inquiry ${ticketRef} from ${inquiryFields.name}`,
      body: `${inquiryFields.services.join(', ')} (${inquiryFields.urgency ?? 'standard'})`,
      href: '/admin/inquiries',
    });

    await enqueueTransactionalEmail({
      toEmail: inquiryFields.email,
      template: 'inquiry_received_customer',
      subject: `[${ticketRef}] We Received Your Project Brief — redwan.work`,
      payload: {
        message: `Hi ${inquiryFields.name}, thank you for reaching out. Your inquiry (${ticketRef}) for ${inquiryFields.services.join(', ')} has been logged and will be reviewed within 12 hours.`,
        actionUrl: `${siteOrigin}/contact`,
      },
      entityType: 'inquiry',
      entityId: data.id,
    });

    await enqueueTransactionalEmail({
      toEmail: adminEmail,
      template: 'inquiry_received_admin',
      subject: `[${ticketRef}] New Inquiry from ${inquiryFields.name} (${inquiryFields.country})`,
      payload: {
        message: `${inquiryFields.name} (${inquiryFields.email}) submitted inquiry ${ticketRef} for ${inquiryFields.services.join(', ')}.\n\nSummary:\n${inquiryFields.project_summary.slice(0, 500)}`,
        actionUrl: `${siteOrigin}/admin/inquiries`,
      },
      entityType: 'inquiry',
      entityId: data.id,
    });

    return { ok: true, ticketRef };
  } catch {
    console.error('Inquiry insert failed.');
    return { ok: false, error: 'Could not save your message.' };
  }
}
