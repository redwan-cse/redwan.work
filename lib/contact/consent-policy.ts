import 'server-only';
import { createHash } from 'node:crypto';

/** I03 infrastructure only. No live route imports this module. No env switch,
 * published policy, migration activation, backfill or marketing permission.
 * Explicit future approval is required to wire a database-backed control into
 * intake. Synthetic registry/control inputs are supplied by isolated tests.
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
  // Reject ambiguous/non-roundtrippable Unicode and control bytes. LF is the
  // one allowed line separator; no normalization, trimming or line rewriting.
  if (/[-\u0009\u000b-\u001f\u007f]/u.test(value)) return false;
  return Buffer.from(value, 'utf8').toString('utf8') === value;
}
export function archivePolicy(bundle: PolicyBundle): ArchivedPolicy {
  if (!bundle || !VERSION.test(bundle.version) || ![bundle.checkbox,bundle.privacyNotice,bundle.attachmentNotice,bundle.policyText].every(policyText)) throw new Error('Invalid policy bundle.');
  const canonical = JSON.stringify({schema:1,version:bundle.version,checkbox:bundle.checkbox,privacyNotice:bundle.privacyNotice,attachmentNotice:bundle.attachmentNotice,policyText:bundle.policyText});
  if (Buffer.byteLength(canonical,'utf8') > 262144) throw new Error('Invalid policy bundle.');
  return Object.freeze({version:bundle.version,canonical,hash:createHash('sha256').update(canonical,'utf8').digest('hex')});
}
export function validateConsentSubmission(
  form: FormData,
  control: Readonly<{ activeVersion: string | null; policies: readonly ArchivedPolicy[] }>,
  now: () => Date = () => new Date(),
): ConsentDecision {
  // Test-first scaffold: refuses all activation until desired contracts pass.
  void form; void control; void now;
  return {ok:false,status:503,code:'disabled'};
}
export function consentEvidenceView(row: Partial<ConsentEvidence>, policies: readonly ArchivedPolicy[]): 'unknown' | 'invalid' | 'recorded' {
  void row; void policies;
  return 'unknown';
}
