'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, KeyRound } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { sanitizeAdminMfaNextPath } from '@/lib/security/safe-redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FormMessage } from '@/components/auth/auth-form';

interface TotpEnrollmentState {
  factorId: string;
  qrCodeSvg?: string;
  secret?: string;
}

export default function AdminMfaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollmentState | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadMfaFactors() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: listErr } = await supabase.auth.mfa.listFactors();
        if (!active) return;
        if (listErr) {
          setError('Unable to load multi-factor authentication status. Please sign in again.');
          setLoading(false);
          return;
        }
        const verifiedTotp = data?.totp?.find((f) => f.status === 'verified');
        if (verifiedTotp) {
          setFactorId(verifiedTotp.id);
          setLoading(false);
          return;
        }
        const staleUnverified = (data?.totp ?? []).filter((f) => f.status !== 'verified');
        for (const stale of staleUnverified) {
          await supabase.auth.mfa.unenroll({ factorId: stale.id }).catch(() => undefined);
        }
        const { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'redwan.work Command Center',
        });
        if (!active) return;
        if (enrollErr || !enrolled?.id) {
          setError(enrollErr?.message ?? 'Unable to enroll TOTP authenticator factor.');
          setLoading(false);
          return;
        }
        setFactorId(enrolled.id);
        setEnrollment({
          factorId: enrolled.id,
          qrCodeSvg: enrolled.totp?.qr_code,
          secret: enrolled.totp?.secret,
        });
        setLoading(false);
      } catch {
        if (active) {
          setError('Multi-factor verification is temporarily unavailable.');
          setLoading(false);
        }
      }
    }
    void loadMfaFactors();
    return () => {
      active = false;
    };
  }, []);

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || code.trim().length < 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (verifyErr) {
        setError('Invalid verification code. Please check your authenticator app and try again.');
        setSubmitting(false);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const targetAdminPath = sanitizeAdminMfaNextPath(params.get('next'));
      router.replace(targetAdminPath);
      router.refresh();
    } catch {
      setError('Unable to complete MFA verification. Please try again.');
      setSubmitting(false);
    }
  }

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
          <form onSubmit={handleVerify} className="space-y-4">
            {enrollment && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                <p className="font-medium text-foreground">
                  Scan this QR code in your authenticator app or enter the setup key manually:
                </p>
                {enrollment.qrCodeSvg && (
                  <div className="flex justify-center rounded-md bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={enrollment.qrCodeSvg}
                      alt="Authenticator QR code for redwan.work Command Center"
                      className="h-40 w-40"
                    />
                  </div>
                )}
                {enrollment.secret && (
                  <p className="break-all font-mono text-[11px] text-muted-foreground">
                    Manual key: <span className="font-semibold text-foreground">{enrollment.secret}</span>
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="totp-code">6-digit authenticator code</Label>
              <Input
                id="totp-code"
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>

            {error && <FormMessage state={{ error }} />}

            <Button type="submit" className="w-full" disabled={submitting || !factorId}>
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
