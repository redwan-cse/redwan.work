import 'server-only';
import { createHash } from 'node:crypto';

/** I03 infrastructure only. No live route imports this module. No env switch,
 * published policy, migration activation, backfill or marketing permission.
 * Explicit future approval is required to wire a database-backed control into
 * intake. Synthetic registry/control inputs are supplied by isolated tests.
 * Stale (409) consumers must retain draft/attachment metadata in memory, clear
 * the checkbox, display the new bundle and require explicit review/recheck.
 * This module never mutates a form or automatically retries a submission.
 */
export const CONSENT_ACTIVATION_ENABLED = false;
export type PolicyBundle = Readonly<{
  version: string;
  checkbox: string;
  privacyNotice: string;
  attachmentNotice: string;
  policyText: string;
}>;
export type ArchivedPolicy = Readonly<{ version: string; canonical: string; hash: string }>;
export type ConsentEvidence = Readonly<{
  consent_policy_version: string;
  consent_policy_hash: string;
  consent_capture_method: 'explicit-checkbox-v1';
  consent_at: string;
}>;
export type ConsentDecision = { ok: true; evidence: ConsentEvidence } | {
  ok: false; status: 400 | 409 | 503; code: 'invalid' | 'stale' | 'disabled' | 'unavailable';
};
const VERSION = /^[a-z][a-z0-9-]{0,63}$/;
function policyText(value: unknown): value is string {
  if (typeof value !== 'string' || !value.length || Buffer.byteLength(value, 'utf8') > 131072) return false;
  // LF only; reject controls and non-roundtrippable Unicode. Do not normalize,
  // trim, truncate or rewrite bytes that a person may have been shown.
  if (/[-\u0009\u000b-\u001f\u007f]/u.test(value)) return false;
  return Buffer.from(value, 'utf8').toString('utf8') === value;
}
function isPolicyBundle(value: unknown): value is PolicyBundle {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && 'version' in value && typeof value.version === 'string' && VERSION.test(value.version)
    && 'checkbox' in value && policyText(value.checkbox)
    && 'privacyNotice' in value && policyText(value.privacyNotice)
    && 'attachmentNotice' in value && policyText(value.attachmentNotice)
    && 'policyText' in value && policyText(value.policyText);
}
export function archivePolicy(bundle: unknown): ArchivedPolicy {
  if (!isPolicyBundle(bundle)) throw new Error('Invalid policy bundle.');
  const canonical = JSON.stringify({schema:1,version:bundle.version,checkbox:bundle.checkbox,privacyNotice:bundle.privacyNotice,attachmentNotice:bundle.attachmentNotice,policyText:bundle.policyText});
  if (Buffer.byteLength(canonical,'utf8') > 262144) throw new Error('Invalid policy bundle.');
  return Object.freeze({version:bundle.version,canonical,hash:createHash('sha256').update(canonical,'utf8').digest('hex')});
}
function verifiedRegistry(policies: readonly ArchivedPolicy[]): Map<string, ArchivedPolicy> | null {
  try {
    if (!Array.isArray(policies) || policies.length > 1000) return null;
    const registry = new Map<string, ArchivedPolicy>();
    for (const policy of policies) {
      if (!policy || typeof policy.canonical !== 'string' || Buffer.byteLength(policy.canonical,'utf8') > 262144 || typeof policy.hash !== 'string' || !/^[a-f0-9]{64}$/.test(policy.hash)) return null;
      const parsed: unknown = JSON.parse(policy.canonical);
      if (!parsed || typeof parsed !== 'object' || !('schema' in parsed) || parsed.schema !== 1) return null;
      const checked = archivePolicy(parsed);
      if (checked.version !== policy.version || checked.hash !== policy.hash || checked.canonical !== policy.canonical || registry.has(checked.version)) return null;
      registry.set(checked.version, checked);
    }
    return registry;
  } catch {
    return null;
  }
}
export function validateConsentSubmission(
  form: FormData,
  control: Readonly<{ activeVersion: string | null; policies: readonly ArchivedPolicy[] }>,
  now: () => Date = () => new Date(),
): ConsentDecision {
  if (!control) return {ok:false,status:503,code:'unavailable'};
  if (control.activeVersion === null) return {ok:false,status:503,code:'disabled'};
  const registry = verifiedRegistry(control.policies);
  if (!registry || typeof control.activeVersion !== 'string' || !registry.has(control.activeVersion)) return {ok:false,status:503,code:'unavailable'};
  if (!(form instanceof FormData) || form.getAll('gdprConsent').length !== 1 || form.get('gdprConsent') !== 'true' || form.getAll('consentPolicyVersion').length !== 1) return {ok:false,status:400,code:'invalid'};
  const displayed = form.get('consentPolicyVersion');
  if (typeof displayed !== 'string' || !VERSION.test(displayed) || !registry.has(displayed)) return {ok:false,status:400,code:'invalid'};
  if (displayed !== control.activeVersion) return {ok:false,status:409,code:'stale'};
  const policy = registry.get(displayed)!;
  try {
    const at = now();
    if (!(at instanceof Date) || !Number.isFinite(at.getTime()) || at.getUTCFullYear() < 1 || at.getUTCFullYear() > 9999) return {ok:false,status:503,code:'unavailable'};
    return {ok:true,evidence:Object.freeze({consent_policy_version:displayed,consent_policy_hash:policy.hash,consent_capture_method:'explicit-checkbox-v1',consent_at:at.toISOString()})};
  } catch {
    return {ok:false,status:503,code:'unavailable'};
  }
}
/** Recorded means stored checkbox evidence, not proof of reading, identity,
 * marketing consent, current agreement, legal sufficiency or non-withdrawal.
 * Legacy timestamp-only rows remain unknown, never inferred or backfilled.
 */
export function consentEvidenceView(row: Partial<Record<keyof ConsentEvidence, unknown>>, policies: readonly ArchivedPolicy[]): 'unknown' | 'invalid' | 'recorded' {
  if (!row) return 'invalid';
  const {consent_policy_version:version,consent_policy_hash:hash,consent_capture_method:method,consent_at:at} = row;
  if (version == null && hash == null && method == null) return 'unknown';
  if (typeof version !== 'string' || typeof hash !== 'string' || method !== 'explicit-checkbox-v1' || typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(at) || Number(at.slice(0,4)) < 1) return 'invalid';
  const parsed = new Date(at);
  // Validate calendar/time without rewriting the stored microsecond precision.
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,19) !== at.slice(0,19)) return 'invalid';
  const registry = verifiedRegistry(policies);
  return registry?.get(version)?.hash === hash ? 'recorded' : 'invalid';
}
