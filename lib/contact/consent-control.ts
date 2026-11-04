import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { archivePolicy } from '@/lib/contact/consent-policy';
import type { ArchivedPolicy, PolicyBundle } from '@/lib/contact/consent-policy';

export type ConsentControl = Readonly<{
  activeVersion: string | null;
  policies: readonly ArchivedPolicy[];
}>;
export type ConsentControlResult =
  | { ok: true; control: ConsentControl; bundle: PolicyBundle }
  | { ok: false; status: 503; code: 'disabled' | 'unavailable' };

const unavailable = (): ConsentControlResult => ({ ok: false, status: 503, code: 'unavailable' });
const versionPattern = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * One RPC snapshot contains the current policy and, when recognized, the
 * displayed historical version. No registry enumeration or activation write.
 * Database insert guards must still serialize a later activation race.
 */
export async function readConsentControl(displayedVersion: string | null = null): Promise<ConsentControlResult> {
  if (displayedVersion !== null && !versionPattern.test(displayedVersion)) return unavailable();
  try {
    const { data, error } = await getSupabaseAdmin().rpc('contact_consent_control', {
      p_displayed_version: displayedVersion,
    });
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) return unavailable();
    const snapshot = data as Record<string, unknown>;
    if (snapshot.schema !== 1 || !Array.isArray(snapshot.policies) || snapshot.policies.length > 2) return unavailable();
    if (snapshot.activeVersion === null) {
      if (snapshot.policies.length !== 0) return unavailable();
      return { ok: false, status: 503, code: 'disabled' };
    }
    if (typeof snapshot.activeVersion !== 'string' || !versionPattern.test(snapshot.activeVersion)) return unavailable();
    const policies: ArchivedPolicy[] = [];
    for (const candidate of snapshot.policies) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return unavailable();
      const row = candidate as Record<string, unknown>;
      if (typeof row.canonical !== 'string' || Buffer.byteLength(row.canonical, 'utf8') > 262144) return unavailable();
      const parsed: unknown = JSON.parse(row.canonical);
      const checked = archivePolicy(parsed);
      if (checked.canonical !== row.canonical || checked.version !== row.version || checked.hash !== row.hash) return unavailable();
      if (checked.version !== snapshot.activeVersion && checked.version !== displayedVersion) return unavailable();
      policies.push(checked);
    }
    const control: ConsentControl = Object.freeze({
      activeVersion: snapshot.activeVersion,
      policies: Object.freeze(policies),
    });
    if (new Set(policies.map(policy => policy.version)).size !== policies.length) return unavailable();
    const active = policies.find(policy => policy.version === snapshot.activeVersion);
    if (!active) return unavailable();
    const parsed = JSON.parse(active.canonical) as PolicyBundle;
    const bundle = Object.freeze({
      version: parsed.version,
      checkbox: parsed.checkbox,
      privacyNotice: parsed.privacyNotice,
      attachmentNotice: parsed.attachmentNotice,
      policyText: parsed.policyText,
    });
    return { ok: true, control, bundle };
  } catch {
    // Provider diagnostics may include submitted values. Return a fixed code.
    return unavailable();
  }
}
