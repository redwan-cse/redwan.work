import type { PolicyBundle } from './consent-policy';

/** Public, inert text only. Validation mirrors archive bounds, never HTML. */
export function parsePublicConsentPolicy(value: unknown): PolicyBundle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.version !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(row.version)) return null;
  const encoder = new TextEncoder();
  for (const key of ['checkbox', 'privacyNotice', 'attachmentNotice', 'policyText']) {
    const text = row[key];
    if (typeof text !== 'string' || !text || encoder.encode(text).length > 131072) return null;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if ((code < 32 && code !== 10) || code === 127) return null;
    }
    if (new TextDecoder().decode(encoder.encode(text)) !== text) return null;
  }
  const policy = {
    version: row.version,
    checkbox: row.checkbox as string,
    privacyNotice: row.privacyNotice as string,
    attachmentNotice: row.attachmentNotice as string,
    policyText: row.policyText as string,
  };
  if (encoder.encode(JSON.stringify({ schema: 1, ...policy })).length > 262144) return null;
  return Object.freeze(policy);
}

export const CONSENT_STALE_MESSAGE =
  'The Data & Privacy policy changed. Your draft and attachments are saved on this page. Review the policy and check the consent box again.';
export const CONSENT_UNAVAILABLE_MESSAGE =
  'The Data & Privacy policy is unavailable. Your draft and attachments are saved on this page. Please load the policy again before submitting.';
