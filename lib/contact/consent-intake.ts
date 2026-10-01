import 'server-only';
import { readConsentControl } from '@/lib/contact/consent-control';
import { validateConsentSubmission } from '@/lib/contact/consent-policy';
import type { ConsentEvidence, PolicyBundle } from '@/lib/contact/consent-policy';
import { parseLeadPayload } from '@/lib/contact/lead-schema';
import type { NormalizedLead } from '@/lib/contact/lead-schema';

export type ConsentedLead = NormalizedLead & ConsentEvidence;
export type ConsentIntakeResult =
  | { ok: true; lead: ConsentedLead }
  | { ok: false; status: 400; code: 'invalid'; error: string }
  | { ok: false; status: 409; code: 'stale'; error: string; policy: PolicyBundle }
  | { ok: false; status: 503; code: 'disabled' | 'unavailable'; error: string };

/**
 * Approved F20 development integration boundary. It has no persistence,
 * publication, activation, rate-limit, mail or storage side effects.
 * Callers must still retain existing origin, rate, replay and storage checks.
 * Never accept a supplied ConsentEvidence tuple in place of the actual form.
 */
export async function parseConsentedLeadPayload(
  form: FormData,
  meta: { ipHash: string | null; userAgent: string | null },
  now: () => Date = () => new Date(),
): Promise<ConsentIntakeResult> {
  const invalid = (): ConsentIntakeResult => ({
    ok: false, status: 400, code: 'invalid',
    error: 'Please review and agree to the displayed Data & Privacy policy before submitting.',
  });
  if (!(form instanceof FormData) || form.getAll('gdprConsent').length !== 1
    || form.get('gdprConsent') !== 'true'
    || form.getAll('consentPolicyVersion').length !== 1) return invalid();
  const version = form.get('consentPolicyVersion');
  if (typeof version !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(version)) return invalid();
  const parsed = parseLeadPayload(form, meta);
  if (!parsed.ok) return { ok: false, status: 400, code: 'invalid', error: parsed.error };
  const current = await readConsentControl(version);
  if (!current.ok) return {
    ...current,
    error: 'We could not process your message right now. Please try again later.',
  };
  const consent = validateConsentSubmission(form, current.control, now);
  if (!consent.ok) {
    if (consent.code === 'stale') return {
      ok: false, status: 409, code: 'stale', policy: current.bundle,
      error: 'The Data & Privacy policy changed. Review it and check the consent box again.',
    };
    if (consent.status === 400) return invalid();
    return {
      ok: false, status: 503, code: 'unavailable',
      error: 'We could not process your message right now. Please try again later.',
    };
  }
  // Server-authored evidence is applied last, including its server clock.
  // Nothing from the wire or the legacy timestamp-only parser can override it.
  return { ok: true, lead: { ...parsed.lead, ...consent.evidence } };
}
