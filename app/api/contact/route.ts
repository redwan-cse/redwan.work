import { NextRequest, NextResponse } from 'next/server';
import { sha256Hex } from '@/lib/contact/lead-schema';
import { parseConsentedLeadPayload } from '@/lib/contact/consent-intake';
import { readConsentControl } from '@/lib/contact/consent-control';
import type { PolicyBundle } from '@/lib/contact/consent-policy';
import { insertLead } from '@/lib/contact/lead-store';
import { validateMagicBytes } from '@/lib/mime';
import { getPrivateObjectHeadBytes, verifyStoredObjectSize } from '@/lib/r2';
import { resolveTrustedIp } from '@/lib/security/trusted-ip';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

function isAllowedTurnstileHostname(hostname: unknown): boolean {
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.TEST_ENVIRONMENT === 'isolated-ci' ||
    !process.env.NEXT_PUBLIC_SITE_URL
  ) {
    return true;
  }
  if (typeof hostname !== 'string' || !hostname.trim()) return false;
  try {
    const base = new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname.toLowerCase().replace(/^www\./, '');
    const actual = hostname.trim().toLowerCase();
    return actual === base || actual === `www.${base}`;
  } catch {
    return true;
  }
}

export const dynamic = 'force-dynamic';
const WINDOW_SECONDS = 3600;
const MAX_REQUESTS = 5;
const memoryRateMap = new Map<string, number[]>();

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    try { return new URL(origin).host === request.headers.get('host'); } catch { return false; }
  }
  return ['same-origin', 'none'].includes(request.headers.get('sec-fetch-site') ?? '');
}

function memoryAllowed(key: string): boolean {
  const cutoff = Date.now() - WINDOW_SECONDS * 1000;
  if (memoryRateMap.size >= 5000) {
    for (const [id, stamps] of memoryRateMap) {
      const recent = stamps.filter(t => t > cutoff);
      if (recent.length) memoryRateMap.set(id, recent); else memoryRateMap.delete(id);
    }
    // The pre-layer is an optimization, not an unbounded identifier store.
    if (memoryRateMap.size >= 5000 && !memoryRateMap.has(key)) return false;
  }
  const stamps = (memoryRateMap.get(key) ?? []).filter(t => t > cutoff);
  if (stamps.length >= MAX_REQUESTS) return false;
  memoryRateMap.set(key, [...stamps, Date.now()]);
  return true;
}

async function consume(kind: 'ip' | 'turnstile', hash: string, seconds: number, max: number): Promise<boolean | null> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc('consume_rate_limit', {
      p_kind: kind, p_key_hash: hash, p_window_seconds: seconds, p_max_count: max,
    });
    if (error || typeof data !== 'boolean') return null;
    return data;
  } catch { return null; }
}

const unavailable = () => NextResponse.json(
  { error: 'We could not process your message right now. Please try again later.' },
  { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
);

const consentUnavailable = () => NextResponse.json(
  { code: 'consent_unavailable', error: 'The Data & Privacy policy is unavailable. Please try again later.' },
  { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
);
const consentStale = (policy: PolicyBundle) => NextResponse.json(
  { code: 'consent_stale', error: 'Review the current Data & Privacy policy and check the consent box again.', policy },
  { status: 409, headers: { 'Cache-Control': 'no-store' } },
);

/** Public policy text only. No lead reads, consent writes or activation. */
export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return consentUnavailable();
  const current = await readConsentControl();
  if (!current.ok) return consentUnavailable();
  return NextResponse.json({ policy: current.bundle }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json({ error: 'Request origin not allowed.' }, { status: 403 });
    }
    const salt = process.env.LEAD_IP_HASH_SALT;
    const secret = process.env.TURNSTILE_SECRET_KEY;
    const developmentBypass = process.env.NODE_ENV === 'development' && !secret;
    if (!salt || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || (!secret && !developmentBypass)) {
      console.error('Contact configuration unavailable.');
      return unavailable();
    }
    let form: FormData;
    try { form = await request.formData(); } catch {
      return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
    }
    const token = form.get('cf-turnstile-response');
    if (!developmentBypass && (typeof token !== 'string' || !token || token.length > 2048)) {
      return NextResponse.json({ error: 'Verification failed. Please complete the security check.' }, { status: 400 });
    }
    const ip = resolveTrustedIp(request.headers);
    const ipHash = await sha256Hex(salt + ip);
    const parsed = await parseConsentedLeadPayload(form, { ipHash, userAgent: request.headers.get('user-agent') });
    if (!parsed.ok) {
      if (parsed.status === 409) return consentStale(parsed.policy);
      if (parsed.status === 503) return consentUnavailable();
      return NextResponse.json({ error: parsed.error }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!memoryAllowed(ipHash)) return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
    const allowed = await consume('ip', ipHash, WINDOW_SECONDS, MAX_REQUESTS);
    if (allowed === null) { console.error('Contact rate control unavailable.'); return unavailable(); }
    if (!allowed) return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
    if (!developmentBypass) {
      try {
        const body = new FormData();
        body.set('secret', secret!);
        body.set('response', token as string);
        if (ip !== 'unknown') body.set('remoteip', ip);
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', body, signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return unavailable();
        const validation = (await response.json()) as { success?: unknown; hostname?: unknown } | null;
        if (!validation || typeof validation !== 'object' || validation.success !== true || !isAllowedTurnstileHostname(validation.hostname)) {
          return NextResponse.json({ error: 'Security verification failed. Please try again.' }, { status: 400 });
        }
      } catch { console.error('Contact verification unavailable.'); return unavailable(); }
      const unused = await consume('turnstile', await sha256Hex(token as string), 300, 1);
      if (unused === null) { console.error('Contact replay control unavailable.'); return unavailable(); }
      if (!unused) return NextResponse.json({ error: 'Verification token already used. Please reload the form.' }, { status: 400 });
    }
    if (parsed.lead.attachments.length > 0) {
      const checks = await Promise.all(
        parsed.lead.attachments.map(async (attachment) => {
          const [sizeOk, headBytes] = await Promise.all([
            verifyStoredObjectSize(attachment.key, attachment.size_bytes),
            getPrivateObjectHeadBytes(attachment.key, 64),
          ]);
          if (!sizeOk) {
            return 'Attachment data is invalid. Please re-upload your files.';
          }
          if (!headBytes || !validateMagicBytes(headBytes, attachment.mime)) {
            return 'Attachment file signature does not match its declared file type.';
          }
          return null;
        })
      );
      const firstError = checks.find((err) => err !== null);
      if (firstError) {
        return NextResponse.json({ error: firstError }, { status: 400 });
      }
    }
    const stored = await insertLead(parsed.lead);
    if (!stored.ok && stored.code === 'consent_stale') {
      // Database activation may have changed after validation. Refresh only the
      // public bundle; never retry the insert or restamp without a new checkbox.
      const current = await readConsentControl();
      return current.ok ? consentStale(current.bundle) : consentUnavailable();
    }
    if (!stored.ok && stored.code === 'consent_unavailable') return consentUnavailable();
    if (!stored.ok) return NextResponse.json({ error: 'We could not process your message right now. Please try again or email us directly.' }, { status: 502 });
    return NextResponse.json({ success: true, message: 'Your message has been sent successfully!', ticketRef: stored.ticketRef });
  } catch {
    console.error('Contact submission failed.');
    return unavailable();
  }
}
