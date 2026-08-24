import { createHash } from 'crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export interface NormalizedLead {
  name: string;
  email: string;
  country: string | null;
  whatsapp_e164: string | null;
  preferred_contact_method: string | null;
  timezone: string | null;
  preferred_contact_date: string | null;
  best_time_to_contact: string | null;
  services: string[];
  company: string | null;
  project_url: string | null;
  project_summary: string;
  nda_required: boolean;
  urgency: string | null;
  budget_min: number | null;
  budget_max: number | null;
  how_found: string | null;
  source_page: string | null;
  device_type: string | null;
  user_agent: string | null;
  ip_hash: string | null;
  consent_at: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_SUMMARY = 5000;
const MAX_BUDGET = 10_000_000;

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function nullable(str_: string, max = 500): string | null {
  const trimmed = str_.slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

export async function sha256Hex(input: string): Promise<string> {
  return createHash('sha256').update(input).digest('hex');
}

export function parseLeadPayload(
  formData: FormData,
  meta: { ipHash: string | null; userAgent: string | null }
): { ok: true; lead: NormalizedLead } | { ok: false; error: string } {
  const name = nullable(str(formData, 'name'), 200);
  const emailRaw = str(formData, 'email').toLowerCase();
  const summary = str(formData, 'projectSummary');

  if (!name || !EMAIL_RE.test(emailRaw) || !summary) {
    return { ok: false, error: 'Missing or invalid required fields.' };
  }
  if (summary.length > MAX_SUMMARY) {
    return { ok: false, error: 'Project summary is too long.' };
  }

  let whatsappE164: string | null = null;
  const whatsappRaw = str(formData, 'whatsAppNumber'); // client sends combined "+880…"
  if (whatsappRaw.length > 0) {
    const parsed = parsePhoneNumberFromString(whatsappRaw);
    if (!parsed || !parsed.isValid()) {
      return { ok: false, error: 'Invalid WhatsApp number.' };
    }
    whatsappE164 = parsed.number;
  }

  const budgetMin = Number.parseInt(str(formData, 'budgetMin'), 10);
  const budgetMax = Number.parseInt(str(formData, 'budgetMax'), 10);

  // Client merges "Other" into a comma-joined string; store as one-element array
  const serviceType = str(formData, 'serviceType');
  const services: string[] = serviceType ? [serviceType] : [];

  const contactDate = str(formData, 'preferredContactDate');

  return {
    ok: true,
    lead: {
      name,
      email: emailRaw,
      country: nullable(str(formData, 'country')),
      whatsapp_e164: whatsappE164,
      preferred_contact_method: nullable(str(formData, 'preferredContactMethod')),
      timezone: nullable(str(formData, 'timeZone')),
      preferred_contact_date:
        contactDate && !Number.isNaN(new Date(contactDate).getTime())
          ? new Date(contactDate).toISOString().slice(0, 10)
          : null,
      best_time_to_contact: nullable(str(formData, 'bestTimeToContact')),
      services,
      company: nullable(str(formData, 'company')),
      project_url: nullable(str(formData, 'projectUrlOrFiles')),
      project_summary: summary,
      nda_required: str(formData, 'ndaConfidentiality').toLowerCase() === 'yes',
      urgency: nullable(str(formData, 'urgency')),
      budget_min: Number.isFinite(budgetMin) ? Math.min(Math.max(budgetMin, 0), MAX_BUDGET) : null,
      budget_max: Number.isFinite(budgetMax) ? Math.min(Math.max(budgetMax, 0), MAX_BUDGET) : null,
      how_found: nullable(str(formData, 'howDidYouFindMe'), 300),
      source_page: nullable(str(formData, 'sourcePage'), 300),
      device_type: nullable(str(formData, 'deviceType')),
      user_agent: meta.userAgent?.slice(0, 400) ?? null,
      ip_hash: meta.ipHash,
      consent_at: new Date().toISOString(),
    },
  };
}
