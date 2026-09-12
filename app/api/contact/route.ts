import { NextRequest, NextResponse } from 'next/server';
import { sha256Hex, parseLeadPayload } from '@/lib/contact/lead-schema';
import { insertLead } from '@/lib/contact/lead-store';
import { verifyStoredObjectSize } from '@/lib/r2';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const ipHash = await sha256Hex(salt + ip);
    const parsed = parseLeadPayload(form, { ipHash, userAgent: request.headers.get('user-agent') });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
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
        const validation: unknown = await response.json();
        if (!validation || typeof validation !== 'object' || !('success' in validation) || validation.success !== true) {
          return NextResponse.json({ error: 'Security verification failed. Please try again.' }, { status: 400 });
        }
      } catch { console.error('Contact verification unavailable.'); return unavailable(); }
      const unused = await consume('turnstile', await sha256Hex(token as string), 300, 1);
      if (unused === null) { console.error('Contact replay control unavailable.'); return unavailable(); }
      if (!unused) return NextResponse.json({ error: 'Verification token already used. Please reload the form.' }, { status: 400 });
    }
    for (const attachment of parsed.lead.attachments) {
      if (!await verifyStoredObjectSize(attachment.key, attachment.size_bytes)) {
        return NextResponse.json({ error: 'Attachment data is invalid. Please re-upload your files.' }, { status: 400 });
      }
    }
    const stored = await insertLead(parsed.lead);
    if (!stored.ok) return NextResponse.json({ error: 'We could not process your message right now. Please try again or email us directly.' }, { status: 502 });
    return NextResponse.json({ success: true, message: 'Your message has been sent successfully!', ticketRef: stored.ticketRef });
  } catch {
    console.error('Contact submission failed.');
    return unavailable();
  }
}
