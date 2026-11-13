'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, KeyRound, RotateCcw, Copy, Check } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { sanitizeAdminMfaNextPath } from '@/lib/security/safe-redirect';
import { resetUnverifiedMfaFactorsAction } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FormMessage } from '@/components/auth/auth-form';
import { cn } from '@/lib/utils';

interface TotpEnrollmentState {
  factorId: string;
  qrCodeSvg?: string;
  secret?: string;
}

const DIGIT_COUNT = 6;

export default function AdminMfaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollmentState | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const submittingRef = useRef(false);
  const enrollLockRef = useRef(false);

  const loadMfaFactors = useCallback(async (forceResetUnverified = false) => {
    if (enrollLockRef.current) return;
    enrollLockRef.current = true;

    try {
      await Promise.resolve();
      if (forceResetUnverified) {
        setLoading(true);
        setError(null);
      }
      const supabase = createSupabaseBrowserClient();
      const { data, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) {
        setError('Unable to load multi-factor authentication status. Please sign in again.');
        setLoading(false);
        enrollLockRef.current = false;
        return;
      }

      const allFactors = [
        ...(data?.all ?? []),
        ...(data?.totp ?? []),
      ];
      const uniqueFactors = Array.from(
        new Map(allFactors.map((f) => [f.id, f])).values()
      );

      const verifiedTotp = uniqueFactors.find(
        (f) => f.factor_type === 'totp' && f.status === 'verified'
      );
      if (verifiedTotp && !forceResetUnverified) {
        setFactorId(verifiedTotp.id);
        setEnrollment(null);
        setLoading(false);
        enrollLockRef.current = false;
        return;
      }

      // Unenroll any unverified factors via client SDK and server admin action
      const staleUnverified = uniqueFactors.filter((f) => f.status !== 'verified');
      for (const stale of staleUnverified) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id }).catch(() => undefined);
      }
      if (staleUnverified.length > 0 || forceResetUnverified) {
        await resetUnverifiedMfaFactorsAction().catch(() => undefined);
      }

      let { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'redwan.work Command Center',
      });

      // Fallback if friendlyName still collides due to concurrent StrictMode mount
      if (enrollErr) {
        await resetUnverifiedMfaFactorsAction().catch(() => undefined);
        const retry = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `redwan.work Command Center (${Date.now().toString(36).slice(-4)})`,
        });
        enrolled = retry.data;
        enrollErr = retry.error;
      }

      if (enrollErr || !enrolled?.id) {
        setError(enrollErr?.message ?? 'Unable to enroll TOTP authenticator factor.');
        setLoading(false);
        enrollLockRef.current = false;
        return;
      }

      setFactorId(enrolled.id);
      setEnrollment({
        factorId: enrolled.id,
        qrCodeSvg: enrolled.totp?.qr_code,
        secret: enrolled.totp?.secret,
      });
      setDigits(Array(DIGIT_COUNT).fill(''));
      setLoading(false);
    } catch {
      setError('Multi-factor verification is temporarily unavailable.');
      setLoading(false);
    } finally {
      enrollLockRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMfaFactors(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMfaFactors]);

  const verifyCode = useCallback(
    async (rawCode: string) => {
      const cleaned = rawCode.replace(/\D/g, '').slice(0, DIGIT_COUNT);
      if (!factorId || cleaned.length < DIGIT_COUNT) {
        setError('Enter all 6 digits from your authenticator app.');
        return;
      }
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setError(null);

      try {
        const supabase = createSupabaseBrowserClient();
        const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
          factorId,
          code: cleaned,
        });
        if (verifyErr) {
          setError('Invalid verification code. Please check your 6-digit authenticator code and try again.');
          setSubmitting(false);
          submittingRef.current = false;
          inputRefs.current[0]?.focus();
          inputRefs.current[0]?.select();
          return;
        }
        const params = new URLSearchParams(window.location.search);
        const targetAdminPath = sanitizeAdminMfaNextPath(params.get('next'));
        router.replace(targetAdminPath);
        router.refresh();
      } catch {
        setError('Unable to complete MFA verification. Please try again.');
        setSubmitting(false);
        submittingRef.current = false;
      }
    },
    [factorId, router]
  );

  const handleDigitChange = (index: number, rawValue: string) => {
    const cleaned = rawValue.replace(/\D/g, '');
    if (error) setError(null);

    if (!cleaned) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    // Multi-character input (paste or programmatic .fill('123456') on #totp-code)
    if (cleaned.length > 1) {
      const next = [...digits];
      const startIdx = cleaned.length === DIGIT_COUNT ? 0 : index;
      for (let i = 0; i < cleaned.length && startIdx + i < DIGIT_COUNT; i++) {
        next[startIdx + i] = cleaned[i];
      }
      setDigits(next);
      const focusTarget = Math.min(startIdx + cleaned.length, DIGIT_COUNT - 1);
      inputRefs.current[focusTarget]?.focus();

      const fullCode = next.join('');
      if (next.every((d) => d.length === 1) && fullCode.length === DIGIT_COUNT) {
        void verifyCode(fullCode);
      }
      return;
    }

    // Single digit typed
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);

    if (index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    }

    const fullCode = next.join('');
    if (next.every((d) => d.length === 1) && fullCode.length === DIGIT_COUNT) {
      void verifyCode(fullCode);
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        setDigits(next);
        event.preventDefault();
      } else if (index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        setDigits(next);
        inputRefs.current[index - 1]?.focus();
        event.preventDefault();
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
      event.preventDefault();
    } else if (event.key === 'ArrowRight' && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus();
      event.preventDefault();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, DIGIT_COUNT);
    if (!pasted) return;
    event.preventDefault();
    if (error) setError(null);

    const next = Array(DIGIT_COUNT)
      .fill('')
      .map((_, idx) => pasted[idx] ?? '');
    setDigits(next);

    const focusIdx = Math.min(pasted.length, DIGIT_COUNT - 1);
    inputRefs.current[focusIdx]?.focus();

    if (pasted.length === DIGIT_COUNT) {
      void verifyCode(pasted);
    }
  };

  async function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await verifyCode(digits.join(''));
  }

  const handleCopySecret = async () => {
    if (!enrollment?.secret) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
          Multi-Factor Verification (AAL2)
        </CardTitle>
        <CardDescription>
          Administrative access requires verified TOTP assurance before entering the Command Center.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Preparing authenticator verification…
          </p>
        ) : (
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {enrollment && (
              <div className="space-y-3 rounded-xl border border-border/80 bg-muted/30 p-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">
                    1. Scan this QR code in your authenticator app:
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadMfaFactors(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset QR
                  </button>
                </div>
                {enrollment.qrCodeSvg && (
                  <div className="flex justify-center rounded-lg border border-border/60 bg-white p-3 shadow-2xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={enrollment.qrCodeSvg}
                      alt="Authenticator QR code for redwan.work Command Center"
                      className="h-44 w-44"
                    />
                  </div>
                )}
                {enrollment.secret && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2">
                    <p className="break-all font-mono text-[11px] text-muted-foreground">
                      Setup key: <span className="font-semibold text-foreground">{enrollment.secret}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopySecret()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 hover:text-primary"
                    >
                      {copiedSecret ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="totp-code">6-digit authenticator code</Label>
                <span className="text-[11px] text-muted-foreground">
                  Auto-verifies on 6th digit
                </span>
              </div>

              <input type="hidden" name="code" value={digits.join('')} />

              <div
                className="grid grid-cols-6 gap-1.5 sm:gap-2.5"
                role="group"
                aria-label="6-digit authenticator code"
              >
                {digits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    id={idx === 0 ? 'totp-code' : `totp-code-${idx + 1}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${idx + 1} of 6`}
                    maxLength={idx === 0 ? 6 : 1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    onFocus={(e) => e.currentTarget.select()}
                    className={cn(
                      'h-12 w-full rounded-xl border bg-background text-center font-mono text-lg font-bold tracking-tight text-foreground shadow-2xs transition outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 sm:h-13 sm:text-xl',
                      error
                        ? 'border-destructive/70 bg-destructive/5 text-destructive focus:border-destructive focus:ring-destructive/25'
                        : digit
                          ? 'border-primary/60 bg-primary/5'
                          : 'border-input'
                    )}
                  />
                ))}
              </div>
            </div>

            {error && <FormMessage state={{ error }} />}

            <Button
              type="submit"
              className="w-full"
              disabled={!factorId || submitting}
              aria-label="Verify & Continue"
            >
              {submitting ? 'Verifying…' : 'Verify & Continue'}
            </Button>
          </form>
        )}

        <form action="/api/auth/logout" method="post" className="pt-1 text-center">
          <button
            type="submit"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Sign out of this session
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
