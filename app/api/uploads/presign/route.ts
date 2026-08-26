import { NextRequest, NextResponse } from 'next/server';
import {
  CONTACT_MAX_FILES,
  isR2Configured,
  presignContactUpload,
  validateContactFile,
} from '@/lib/r2';
import { sha256Hex } from '@/lib/contact/lead-schema';

/**
 * Presign API for contact-form attachments
 *
 * Issues short-lived R2 upload URLs for validated contact files. This route:
 * 1. Rejects cross-site posts (same-origin check, mirrors the contact route)
 * 2. Validates each file (extension + size + declared mime cross-check)
 * 3. Rate-limits per IP via the atomic Supabase RPC (fail-closed)
 * 4. Verifies the Turnstile token with Cloudflare siteverify and enforces
 *    single-use tokens via a replay window in Postgres
 * 5. Returns presigned PUT URLs for every accepted file
 *
 * Environment Variables Required:
 * - R2_ENDPOINT / R2_PRIVATE_BUCKET / R2_PRIVATE_ACCESS_KEY_ID / R2_PRIVATE_SECRET_ACCESS_KEY
 * - TURNSTILE_SECRET_KEY: Cloudflare Turnstile secret key (server-only)
 * - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY: Supabase project credentials
 * - LEAD_IP_HASH_SALT: salt for one-way IP hashing before rate limiting
 */

interface PresignRequestBody {
  files?: unknown;
  turnstileToken?: unknown;
}

interface TurnstileValidationResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

// Timeout for Turnstile validation (recommended: 10 seconds)
const TURNSTILE_TIMEOUT = 10000;

// Maximum token length (as per Cloudflare specs)
const MAX_TOKEN_LENGTH = 2048;

const PRESIGN_WINDOW_SECONDS = 60 * 60;
const PRESIGN_MAX_REQUESTS = 20;
const TURNSTILE_REUSE_WINDOW_SECONDS = 5 * 60;

// Carried review finding from lib/r2.ts Task 1: validateContactFile does not
// inspect mime, so this endpoint cross-checks the browser-reported type against
// the extension before presigning.
const EXT_ALLOWED_MIMES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['application/msword'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

// ==============================================
// Same-origin protection
// ==============================================

/**
 * Reject cross-site uploads. Browsers always send Origin on fetch()
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
// Rate limiting (Supabase-backed, atomic, fail-closed)
// Unlike the contact route there is deliberately NO memory fallback:
// if the DB is unavailable we refuse to hand out upload URLs.
// ==============================================

async function consumeDbRateLimit(
  kind: string,
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
    return null; // signals fail-closed
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  try {
    // ---- 1. Same-origin check first ----
    if (!isSameOrigin(request)) {
      console.warn('Presign rejected: cross-origin request', {
        origin: request.headers.get('origin'),
        host: request.headers.get('host'),
      });
      return jsonError('Request origin not allowed.', 403);
    }

    // ---- 2. Attachments feature gate ----
    if (!isR2Configured()) {
      console.error('R2 is not configured: set R2_ENDPOINT, R2_PRIVATE_BUCKET, R2_PRIVATE_ACCESS_KEY_ID, R2_PRIVATE_SECRET_ACCESS_KEY');
      return jsonError(
        'Attachments are temporarily unavailable. You can still submit the form without files.',
        503
      );
    }

    // ---- 3. Body + per-file validation ----
    let body: PresignRequestBody;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid request.', 400);
    }

    const files = body.files;
    if (!Array.isArray(files) || files.length < 1 || files.length > CONTACT_MAX_FILES) {
      return jsonError(
        `Please attach between 1 and ${CONTACT_MAX_FILES} files.`,
        400
      );
    }

    interface ValidatedFile {
      filename: string;
      mime: string;
      size: number;
    }
    const validatedFiles: ValidatedFile[] = [];

    for (const f of files) {
      if (
        typeof f !== 'object' ||
        f === null ||
        typeof (f as { filename?: unknown }).filename !== 'string' ||
        typeof (f as { mime?: unknown }).mime !== 'string' ||
        typeof (f as { size?: unknown }).size !== 'number'
      ) {
        return jsonError('Invalid request.', 400);
      }
      const candidate = f as { filename: string; mime: string; size: number };

      const check = validateContactFile(candidate);
      if (!check.ok) {
        return jsonError(check.error, 400);
      }

      // ---- 3.5 Mime/extension cross-check ----
      const normalizedMime = candidate.mime.trim().toLowerCase().split(';')[0].trim();
      const allowedMimes = EXT_ALLOWED_MIMES[check.ext];
      if (!allowedMimes || !allowedMimes.includes(normalizedMime)) {
        return jsonError('File type does not match its extension.', 400);
      }

      validatedFiles.push({
        filename: candidate.filename,
        mime: normalizedMime,
        size: candidate.size,
      });
    }

    // Token presence checks (mirrors the contact route wording)
    const turnstileToken =
      typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
    if (!turnstileToken) {
      return jsonError('Verification failed. Please complete the security check.', 400);
    }
    if (turnstileToken.length > MAX_TOKEN_LENGTH) {
      console.warn('Turnstile token exceeds maximum length');
      return jsonError('Invalid verification token.', 400);
    }

    // ---- 4. Per-IP presign budget (salted hash, fail-closed) ----
    const clientIp =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const ipSalt = process.env.LEAD_IP_HASH_SALT ?? '';
    if (!ipSalt) {
      console.error('LEAD_IP_HASH_SALT is unset: refusing to presign uploads.');
      return jsonError(
        'Attachments are temporarily unavailable. You can still submit the form without files.',
        503
      );
    }

    const ipHash = await sha256Hex(ipSalt + clientIp);
    const withinBudget = await consumeDbRateLimit(
      'presign-ip',
      ipHash,
      PRESIGN_WINDOW_SECONDS,
      PRESIGN_MAX_REQUESTS
    );
    if (withinBudget === null) {
      return jsonError(
        'Attachments are temporarily unavailable. You can still submit the form without files.',
        503
      );
    }
    if (withinBudget === false) {
      return jsonError('Too many upload requests. Please try again later.', 429);
    }

    // ---- 5. Turnstile siteverify + single-use replay guard ----
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (!turnstileSecret) {
      console.error('TURNSTILE_SECRET_KEY is not configured');
      return jsonError('Server configuration error. Please contact support.', 500);
    }

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

      const turnstileResult: TurnstileValidationResponse = await turnstileResponse.json();

      if (!turnstileResult.success) {
        console.warn('Turnstile validation failed:', {
          errors: turnstileResult['error-codes'],
          timestamp: new Date().toISOString(),
        });
        return jsonError('Security verification failed. Please reload the form.', 400);
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Turnstile validation timeout');
        return jsonError('Verification timeout. Please try again.', 408);
      }

      console.error('Turnstile validation error:', error);
      return jsonError('Verification service unavailable. Please try again.', 503);
    }

    const tokenHash = await sha256Hex(turnstileToken);
    const unused = await consumeDbRateLimit(
      'turnstile',
      tokenHash,
      TURNSTILE_REUSE_WINDOW_SECONDS,
      1
    );
    if (unused === null) {
      return jsonError(
        'Attachments are temporarily unavailable. You can still submit the form without files.',
        503
      );
    }
    if (unused === false) {
      return jsonError('Verification token already used. Please reload the form.', 400);
    }

    // ---- 6. Presign every accepted file ----
    const uploads = [];
    for (const file of validatedFiles) {
      const { key, uploadUrl } = await presignContactUpload(file.filename, file.mime, file.size);
      uploads.push({ key, uploadUrl, filename: file.filename });
    }

    return NextResponse.json({ uploads });
  } catch (error) {
    // Catch-all error handler — never expose internal details
    console.error('❌ Presign submission error:', error instanceof Error ? error.message : 'Unknown error');
    return jsonError(
      'An error occurred while processing your request. Please try again.',
      500
    );
  }
}
