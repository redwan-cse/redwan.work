import { NextRequest, NextResponse } from 'next/server';

/**
 * Contact Form API Route with Cloudflare Turnstile Protection
 * 
 * This route:
 * 1. Receives form submission from the contact form
 * 2. Validates the Turnstile token with Cloudflare's siteverify endpoint
 * 3. If valid, forwards the form data to Google Forms
 * 4. Returns success/error response to the client
 * 
 * Environment Variables Required:
 * - TURNSTILE_SECRET_KEY: Cloudflare Turnstile secret key (server-only)
 * - GOOGLE_FORM_ACTION_URL: Google Forms submission URL
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
// Interim in-memory rate limiting
//
// NOTE: On Vercel each serverless instance keeps its own counters, so
// this is an approximation. Real enforcement arrives with Supabase
// (see docs/plan/next-stage-plan.md Phase 1).
// ==============================================

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_PRUNE_THRESHOLD = 5000;

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  if (rateLimitMap.size > RATE_LIMIT_PRUNE_THRESHOLD) {
    Array.from(rateLimitMap.entries()).forEach(([key, stamps]) => {
      const recent = stamps.filter((t) => t > windowStart);
      if (recent.length === 0) {
        rateLimitMap.delete(key);
      } else {
        rateLimitMap.set(key, recent);
      }
    });
  }

  const timestamps = (rateLimitMap.get(clientIp) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(clientIp, timestamps);
    return false;
  }

  timestamps.push(now);
  rateLimitMap.set(clientIp, timestamps);
  return true;
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

    // Rate limit per client IP
    const clientIpForRate =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (!checkRateLimit(clientIpForRate)) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
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

    // Turnstile validation successful - now forward to Google Forms
    const googleFormUrl = process.env.GOOGLE_FORM_ACTION_URL;
    
    if (!googleFormUrl) {
      console.error('GOOGLE_FORM_ACTION_URL is not configured');
      return NextResponse.json(
        { error: 'Server configuration error. Please contact support.' },
        { status: 500 }
      );
    }

    // Remove the Turnstile token from the form data before forwarding
    formData.delete('cf-turnstile-response');

    // Convert FormData to URLSearchParams for Google Forms
    const googleFormData = new URLSearchParams();
    formData.forEach((value, key) => {
      googleFormData.append(key, value.toString());
    });

    // Forward the form data to Google Forms with timeout
    const googleFormsController = new AbortController();
    const googleFormsTimeoutId = setTimeout(() => googleFormsController.abort(), 15000);

    try {
      const googleResponse = await fetch(googleFormUrl, {
        method: 'POST',
        body: googleFormData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: googleFormsController.signal,
      });

      clearTimeout(googleFormsTimeoutId);

      // Verify the upstream accepted the submission before telling the user it succeeded
      if (!googleResponse.ok) {
        console.error('Google Forms rejected the submission:', {
          status: googleResponse.status,
          statusText: googleResponse.statusText,
        });
        return NextResponse.json(
          { error: 'We could not process your message right now. Please try again or email us directly.' },
          { status: 502 }
        );
      }

      console.log('✅ Contact form submitted successfully to Google Forms');

      return NextResponse.json(
        { 
          success: true, 
          message: 'Your message has been sent successfully!' 
        },
        { status: 200 }
      );

    } catch (error) {
      clearTimeout(googleFormsTimeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Google Forms submission timeout');
        return NextResponse.json(
          { error: 'Form submission timeout. Please try again.' },
          { status: 408 }
        );
      }

      throw error; // Re-throw to be caught by outer catch
    }

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
