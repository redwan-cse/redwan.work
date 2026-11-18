'use client';

import * as React from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ClientMfaCard() {
  const [loading, setLoading] = React.useState(true);
  const [verifiedFactorId, setVerifiedFactorId] = React.useState<string | null>(null);
  const [enrolling, setEnrolling] = React.useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [otpCode, setOtpCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const loadFactors = React.useCallback(async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!error && data) {
        const verified = data.totp.find((f) => f.status === 'verified');
        setVerifiedFactorId(verified?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.mfa
      .listFactors()
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data) {
          const verified = data.totp.find((f) => f.status === 'verified');
          setVerifiedFactorId(verified?.id ?? null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const startEnrollment = async () => {
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const stale of (factors?.totp ?? []).filter((f) => f.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id }).catch(() => undefined);
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'redwan.work Client Portal',
      });
      if (error || !data) {
        toast.error(error?.message ?? 'Could not initialize TOTP enrollment.');
        return;
      }
      setEnrolling({
        factorId: data.id,
        qrCode: data.totp?.qr_code ?? '',
        secret: data.totp?.secret ?? '',
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrolling || !otpCode.trim()) return;
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: enrolling.factorId,
      });
      if (chErr || !challenge) {
        toast.error(chErr?.message ?? 'MFA challenge failed.');
        return;
      }
      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: challenge.id,
        code: otpCode.trim(),
      });
      if (verErr) {
        toast.error(verErr.message);
        return;
      }
      toast.success('Two-factor authentication enabled for your account.');
      setEnrolling(null);
      setOtpCode('');
      setLoading(true);
      await loadFactors();
    } finally {
      setBusy(false);
    }
  };

  const disableMfa = async () => {
    if (!verifiedFactorId) return;
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactorId });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Two-factor authentication removed.');
      setLoading(true);
      await loadFactors();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-border/80 bg-card/85">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            {verifiedFactorId ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-primary" />
            )}
            Optional Two-Factor Authentication (TOTP)
          </CardTitle>
          <Badge variant={verifiedFactorId ? 'default' : 'outline'} className="font-mono text-[10px]">
            {loading ? 'CHECKING' : verifiedFactorId ? 'ENABLED' : 'NOT ENABLED'}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Protect downloads, proposals, and payment submissions with a 6-digit authenticator app code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking enrolled authenticators...
          </div>
        ) : verifiedFactorId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            <span>TOTP Authenticator is active on your account.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={disableMfa}
              className="text-destructive hover:text-destructive"
            >
              Remove 2FA
            </Button>
          </div>
        ) : enrolling ? (
          <form onSubmit={confirmEnrollment} className="space-y-3">
            {enrolling.qrCode && (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 bg-white p-3 text-slate-900">
                <Image
                  src={enrolling.qrCode}
                  alt="Scan TOTP QR code"
                  width={112}
                  height={112}
                  unoptimized
                  className="h-28 w-28"
                />
                <div className="min-w-0 flex-1 space-y-1 text-xs">
                  <div className="font-semibold">Scan with 1Password / Authy / Google Authenticator</div>
                  <div className="break-all font-mono text-[11px] text-slate-600">
                    Secret: {enrolling.secret}
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Enter 6-Digit Verification Code</Label>
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  maxLength={8}
                  required
                  placeholder="123456"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <Button type="submit" size="sm" disabled={busy}>
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Verify &amp; Enable
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEnrolling(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={startEnrollment}>
            Enable Authenticator App (2FA)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
