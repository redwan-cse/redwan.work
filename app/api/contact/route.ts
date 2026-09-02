import { NextRequest, NextResponse } from 'next/server';
import { sha256Hex, parseLeadPayload } from '@/lib/contact/lead-schema';
import { insertLead } from '@/lib/contact/lead-store';
import { verifyStoredObjectSize } from '@/lib/r2';

/**
 * Contact Form API Route with Cloudflare Turnstile Protection
 *
 * This route:
 * 1. Receives form submission from the contact form
 * 2. Validates the Turnstile token with Cloudflare's siteverify endpoint
 * 3. Rate-limits per IP (memory pre-layer + atomic Supabase RPC)
 * 4. Stores the lead in Supabase Postgres and returns a server-issued ticket ref
 *
 * Environment Variables Required:
 * - TURNSTILE_SECRET_KEY: Cloudflare Turnstile secret key (server-only)
 * - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY: Supabase project credentials
 * - LEAD_IP_HASH_SALT: salt for one-way IP hashing before storage
 *
 * Implementation follows Cloudflare's official best practices:
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

interface TurnstileValidationResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
  action?: string;
  cdata?: string;
  metadata?: {
    ephemeral_id?: string;
  };
}

// Timeout for Turnstile validation (recommended: 10 seconds)
const TURNSTILE_TIMEOUT = 10000;

// Maximum token length (as per Cloudflare specs)
const MAX_TOKEN_LENGTH = 2048;

// ==============================================
// Same-origin protection
// ==============================================

/**
 * Reject cross-site form posts. Browsers always send Origin on fetch()
 * POSTs; non-browser clients that omit it must present a same-origin
 * Sec-Fetch-Site metadata header.
 */
function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host');
  const origin = request.headers.get('origin');

  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  return fetchSite === 'same-origin' || fetchSite === 'none';
}

// ==============================================
// Rate limiting (Supabase-backed, atomic)
// Falls back to per-instance memory when Supabase is unconfigured.
// ==============================================

const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_PRUNE_THRESHOLD = 5000;
const TURNSTILE_REUSE_WINDOW_SECONDS = 5 * 60;

const memoryRateMap = new Map<string, number[]>();

function checkMemoryRateLimit(clientIp: string): boolean {
  const now = Date.now();

  if (memoryRateMap.size > RATE_LIMIT_PRUNE_THRESHOLD) {
    Array.from(memoryRateMap.entries()).forEach(([key, stamps]) => {
      const recent = stamps.filter((t) => t > now - RATE_LIMIT_WINDOW_SECONDS * 1000);
      if (recent.length === 0) memoryRateMap.delete(key);
      else memoryRateMap.set(key, recent);
    });
  }

  const stamps = (memoryRateMap.get(clientIp) ?? []).filter(
    (t) => t > now - RATE_LIMIT_WINDOW_SECONDS * 1000
  );
  if (stamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    memoryRateMap.set(clientIp, stamps);
    return false;
  }
  stamps.push(now);
  memoryRateMap.set(clientIp, stamps);
  return true;
}

async function consumeDbRateLimit(
  kind: 'ip' | 'turnstile',
  keyHash: string,
  windowSeconds: number,
  maxCount: number
): Promise<boolean | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    const { data, error } = await getSupabaseAdmin().rpc('consume_rate_limit', {
      p_kind: kind,
      p_key_hash: keyHash,
      p_window_seconds: windowSeconds,
      p_max_count: maxCount,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    console.error('DB rate limit unavailable:', err instanceof Error ? err.message : err);
    return null; // signals fallback
  }
}

export async function POST(request: NextRequest) {
  try {
    // Reject cross-site submissions before doing any work
    if (!isSameOrigin(request)) {
      console.warn('Contact form rejected: cross-origin request', {
        origin: request.headers.get('origin'),
        host: request.headers.get('host'),
      });
      return NextResponse.json(
        { error: 'Request origin not allowed.' },
        { status: 403 }
      );
    }

    // Parse the incoming form data
    const formData = await request.formData();
    
    // Extract the Turnstile token
    const turnstileToken = formData.get('cf-turnstile-response');
    
    // Check if Turnstile is configured
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // In development, if Turnstile is not configured, allow submission with a warning
    if (!turnstileSecret && isDevelopment) {
      console.warn('⚠️  TURNSTILE_SECRET_KEY is not configured. Skipping Turnstile validation in development mode.');
    } else {
      // Input validation: Check token exists and is a string
      if (!turnstileToken || typeof turnstileToken !== 'string') {
        return NextResponse.json(
          { error: 'Verification failed. Please complete the security check.' },
          { status: 400 }
        );
      }

      // Input validation: Check token length (max 2048 characters as per Cloudflare specs)
      if (turnstileToken.length > MAX_TOKEN_LENGTH) {
        console.warn('Turnstile token exceeds maximum length');
        return NextResponse.json(
          { error: 'Invalid verification token.' },
          { status: 400 }
        );
      }

      // Check if secret key is configured
      if (!turnstileSecret) {
        console.error('TURNSTILE_SECRET_KEY is not configured in production');
        return NextResponse.json(
          { error: 'Server configuration error. Please contact support.' },
          { status: 500 }
        );
      }

      // Validate the Turnstile token with Cloudflare
      // Get client IP for additional validation (recommended by Cloudflare)
      // Priority: CF-Connecting-IP > X-Forwarded-For > X-Real-IP
      const clientIp = request.headers.get('cf-connecting-ip') || 
                       request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                       request.headers.get('x-real-ip') || 
                       'unknown';

      // Create AbortController for timeout (best practice: don't wait indefinitely)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT);

      try {
        // Prepare validation request using FormData (recommended format)
        const validationFormData = new FormData();
        validationFormData.append('secret', turnstileSecret);
        validationFormData.append('response', turnstileToken);
        validationFormData.append('remoteip', clientIp);

        // Call Cloudflare Siteverify API
        const turnstileResponse = await fetch(
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
          {
            method: 'POST',
            body: validationFormData,
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        // Parse the validation response
        const turnstileResult: TurnstileValidationResponse = await turnstileResponse.json();

        // Check if Turnstile validation failed
        if (!turnstileResult.success) {
          // Log validation failure with error codes for debugging
          console.warn('Turnstile validation failed:', {
            errors: turnstileResult['error-codes'],
            hostname: turnstileResult.hostname,
            timestamp: new Date().toISOString(),
          });
          
          // Return user-friendly error message (don't expose internal details)
          return NextResponse.json(
            { error: 'Security verification failed. Please try again.' },
            { status: 400 }
          );
        }

        // Optional: Check token age (warn if older than 4 minutes, expires at 5)
        if (turnstileResult.challenge_ts) {
          const challengeTime = new Date(turnstileResult.challenge_ts);
          const now = new Date();
          const ageMinutes = (now.getTime() - challengeTime.getTime()) / (1000 * 60);
          
          if (ageMinutes > 4) {
            console.warn(`Turnstile token is ${ageMinutes.toFixed(1)} minutes old (expires at 5 minutes)`);
          }
        }

        // Log successful validation (without exposing sensitive data)
        console.log('✅ Turnstile validation successful:', {
          hostname: turnstileResult.hostname,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        clearTimeout(timeoutId);
        
        // Handle timeout specifically
        if (error instanceof Error && error.name === 'AbortError') {
          console.error('Turnstile validation timeout');
          return NextResponse.json(
            { error: 'Verification timeout. Please try again.' },
            { status: 408 }
          );
        }

        // Handle other network/API errors
        console.error('Turnstile validation error:', error);
        return NextResponse.json(
          { error: 'Verification service unavailable. Please try again.' },
          { status: 503 }
        );
      }
    }

    // ---- Rate limiting ----
    const clientIp =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (!checkMemoryRateLimit(clientIp)) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    const ipSalt = process.env.LEAD_IP_HASH_SALT ?? '';
    const ipHash = ipSalt ? await sha256Hex(ipSalt + clientIp) : null;

    if (ipHash) {
      const allowed = await consumeDbRateLimit('ip', ipHash, RATE_LIMIT_WINDOW_SECONDS, RATE_LIMIT_MAX_REQUESTS);
      if (allowed === false) {
        return NextResponse.json(
          { error: 'Too many submissions. Please try again later.' },
          { status: 429 }
        );
      }
    }

    // Turnstile token single-use guard (tokens live ~5 minutes)
    if (
      typeof turnstileToken === 'string' &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SECRET_KEY
    ) {
      const tokenHash = await sha256Hex(turnstileToken);
      const unused = await consumeDbRateLimit('turnstile', tokenHash, TURNSTILE_REUSE_WINDOW_SECONDS, 1);
      if (unused === false) {
        return NextResponse.json({ error: 'Verification token already used. Please reload the form.' }, { status: 400 });
      }
    }

    // ---- Supabase sink (sole storage) ----
    if (!ipSalt) {
      console.error('LEAD_IP_HASH_SALT is unset: DB IP limiting and replay guard disabled.');
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      console.error('Supabase credentials missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY');
      return NextResponse.json({ error: 'Server configuration error. Please contact support.' }, { status: 500 });
    }

    const parsed = parseLeadPayload(formData, {
      ipHash: ipHash,
      userAgent: request.headers.get('user-agent'),
    });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Verify stored object sizes for all attachments before persisting lead
    if (parsed.lead.attachments && parsed.lead.attachments.length > 0) {
      for (const att of parsed.lead.attachments) {
        const ok = await verifyStoredObjectSize(att.key, att.size_bytes);
        if (!ok) {
          console.warn('Attachment size mismatch for key:', att.key);
          return NextResponse.json(
            { error: 'Attachment data is invalid. Please re-upload your files.' },
            { status: 400 }
          );
        }
      }
    }

    const stored = await insertLead(parsed.lead);
    if (!stored.ok) {
      return NextResponse.json(
        { error: 'We could not process your message right now. Please try again or email us directly.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Your message has been sent successfully!',
      ticketRef: stored.ticketRef,
    });

  } catch (error) {
    // Catch-all error handler
    console.error('❌ Contact form submission error:', error instanceof Error ? error.message : 'Unknown error');

    // Don't expose internal error details to user
    return NextResponse.json(
      { error: 'An error occurred while processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
