import { createHash } from 'crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { BUDGET_ERROR, parseBudgetRange, parseNdaValues } from '@/lib/contact/intake-contract';
import { CONTACT_ALLOWED, extFromFilename, isAllowedMime } from '@/lib/mime';
import {
  CONTACT_MAX_FILES,
  CONTACT_MAX_SIZE_BYTES,
  isValidContactKey,
} from '@/lib/r2';

export interface LeadAttachment {
  key: string;
  filename: string;
  mime: string;
  size_bytes: number;
  retained?: boolean;
}

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
  attachments: LeadAttachment[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const US_DATE_ONLY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const MAX_SUMMARY = 5000;

function parsePreferredContactDate(raw: string): string | null {
  if (!raw) return null;
  if (ISO_DATE_ONLY_RE.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (
      probe.getUTCFullYear() === y &&
      probe.getUTCMonth() === m - 1 &&
      probe.getUTCDate() === d
    ) {
      return raw;
    }
    return null;
  }
  const usMatch = raw.match(US_DATE_ONLY_RE);
  if (usMatch) {
    const m = Number(usMatch[1]);
    const d = Number(usMatch[2]);
    const y = Number(usMatch[3]);
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (
      probe.getUTCFullYear() === y &&
      probe.getUTCMonth() === m - 1 &&
      probe.getUTCDate() === d
    ) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }
  const parsed = new Date(raw);
  return !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}
const MAX_FILENAME = 255;
const MAX_MIME = 128;
export const ATTACHMENT_INVALID_ERROR =
  'Attachment data is invalid. Please re-attach your files.';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function parseAttachments(raw: string): { ok: true; attachments: LeadAttachment[] } | { ok: false } {
  if (!raw) return { ok: true, attachments: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!Array.isArray(parsed) || parsed.length > CONTACT_MAX_FILES) {
    return { ok: false };
  }

  const attachments: LeadAttachment[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) return { ok: false };
    const candidate = entry as Record<string, unknown>;
    const { key, filename, mime, size_bytes } = candidate;

    if (typeof key !== 'string' || !isValidContactKey(key)) return { ok: false };
    if (typeof filename !== 'string' || filename.length < 1 || filename.length > MAX_FILENAME) {
      return { ok: false };
    }
    const cleanFilename = filename
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .split(/[/\\]/)
      .pop()
      ?.trim() ?? '';
    if (!cleanFilename) return { ok: false };
    if (typeof mime !== 'string' || mime.length > MAX_MIME) return { ok: false };
    const keyExt = extFromFilename(key);
    const fileExt = extFromFilename(cleanFilename);
    if (!keyExt || fileExt !== keyExt || !isAllowedMime(fileExt, mime, CONTACT_ALLOWED)) {
      return { ok: false };
    }
    if (
      typeof size_bytes !== 'number' ||
      !Number.isInteger(size_bytes) ||
      size_bytes < 1 ||
      size_bytes > CONTACT_MAX_SIZE_BYTES
    ) {
      return { ok: false };
    }

    // Store only the validated shape; extra wire fields are dropped — notably
    // `retained`, which is admin-settable (SQL runbook) and never honored from
    // a submission
    attachments.push({ key, filename: cleanFilename, mime, size_bytes });
  }

  return { ok: true, attachments };
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
  if (formData.getAll('gdprConsent').length !== 1 || formData.get('gdprConsent') !== 'true') {
    return { ok: false, error: 'Please agree to the Data & Privacy policy before submitting.' };
  }
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

  const nda = parseNdaValues(formData.getAll('ndaConfidentiality'));
  if (!nda.ok) return nda;
  for (const key of ['budgetMin', 'budgetMax']) {
    const values = formData.getAll(key);
    if (values.length > 1 || (values.length === 1 && typeof values[0] !== 'string')) {
      return { ok: false, error: BUDGET_ERROR };
    }
  }
  const budget = parseBudgetRange(str(formData, 'budgetMin'), str(formData, 'budgetMax'));
  if (!budget.ok) return budget;

  // Client merges "Other" into a comma-joined string; store as one-element array
  const serviceType = str(formData, 'serviceType');
  const services: string[] = serviceType ? [serviceType] : [];

  const contactDate = str(formData, 'preferredContactDate');

  // Raw form field "attachments" is a JSON string produced by the upload flow;
  // absent or empty means no attachments (byte-identical legacy behavior).
  const attachments = parseAttachments(str(formData, 'attachments'));
  if (!attachments.ok) {
    return { ok: false, error: ATTACHMENT_INVALID_ERROR };
  }

  return {
    ok: true,
    lead: {
      name,
      email: emailRaw,
      country: nullable(str(formData, 'country')),
      whatsapp_e164: whatsappE164,
      preferred_contact_method: nullable(str(formData, 'preferredContactMethod')),
      timezone: nullable(str(formData, 'timeZone')),
      preferred_contact_date: parsePreferredContactDate(contactDate),
      best_time_to_contact: nullable(str(formData, 'bestTimeToContact')),
      services,
      company: nullable(str(formData, 'company')),
      project_url: nullable(str(formData, 'projectUrlOrFiles')),
      project_summary: summary,
      nda_required: nda.required,
      urgency: nullable(str(formData, 'urgency')),
      budget_min: budget.minimum,
      budget_max: budget.maximum,
      how_found: nullable(str(formData, 'howDidYouFindMe'), 300),
      source_page: nullable(str(formData, 'sourcePage'), 300),
      device_type: nullable(str(formData, 'deviceType')),
      user_agent: meta.userAgent?.slice(0, 400) ?? null,
      ip_hash: meta.ipHash,
      consent_at: new Date().toISOString(),
      attachments: attachments.attachments,
    },
  };
}
