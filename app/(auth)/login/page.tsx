'use client';

import Link from 'next/link';
import { Suspense, useActionState, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserPlus, LogIn, KeyRound, MailCheck } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { FormMessage } from '@/components/auth/auth-form';
import {
  signInWithPasswordAction,
  checkClientEmailRegistrationAction,
  requestMagicLinkAction,
  requestPasswordResetAction,
  consumeMagicLinkTokenAction,
  type ActionState,
} from '@/lib/auth/actions';

const initial: ActionState = {};

function LoginPageContent() {
  const searchParams = useSearchParams();
  const nextPath = searchParams?.get('next') ?? '';
  const prefilledEmail = searchParams?.get('email') ?? '';
  const alreadyRegistered = searchParams?.get('registered') === '1';
  const initialMode = searchParams?.get('mode') === 'forgot' ? 'forgot' : 'signin';

  const [mode, setMode] = useState<'signin' | 'forgot'>(initialMode);

  const [signInState, signIn, signInPending] = useActionState(signInWithPasswordAction, initial);
  const [checkState, checkEmail, checkPending] = useActionState(
    checkClientEmailRegistrationAction,
    initial
  );
  const [magicState, magic, magicPending] = useActionState(requestMagicLinkAction, initial);
  const [resetState, reset, resetPending] = useActionState(requestPasswordResetAction, initial);

  const tokenHash = searchParams?.get('token_hash') ?? '';
  const tokenType = searchParams?.get('type');
  const deactivated = searchParams?.get('reason') === 'deactivated';

  const [tokenState, setTokenState] = useState<'idle' | 'working' | 'failed'>(
    tokenHash && tokenType === 'magiclink' ? 'working' : 'idle'
  );

  const registerHref = (() => {
    const params = new URLSearchParams();
    if (prefilledEmail) params.set('email', prefilledEmail);
    if (nextPath) params.set('next', nextPath);
    const qs = params.toString();
    return qs ? `/register?${qs}` : '/register';
  })();

  // Dev-only StrictMode note: remount fires verifyOtp twice; the second call
  // fails single-use validation but cookies are already set — prod unaffected.
  useEffect(() => {
    if (tokenState !== 'working') return;
    let cancelled = false;
    consumeMagicLinkTokenAction(tokenHash)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          window.location.assign(result.home);
        } else {
          setTokenState('failed');
        }
      })
      .catch(() => {
        if (!cancelled) setTokenState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [tokenState, tokenHash]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription className="mt-1">
            {mode === 'signin'
              ? 'Sign in to your Client Portal or Admin account, or register as a new client below.'
              : 'We will email you a password reset link if the address has an account.'}
          </CardDescription>
        </div>

        {/* 2-Option Portal / Service Order Member Selector */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/80 bg-muted/30 p-1.5">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-2xs transition"
          >
            <LogIn className="h-3.5 w-3.5" />
            Existing Account
          </button>
          <Link
            href={registerHref}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-transparent bg-background/80 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <UserPlus className="h-3.5 w-3.5" />
            New Member (Register)
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {tokenState === 'working' && (
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        )}
        {tokenState === 'failed' && (
          <FormMessage state={{ error: 'That sign-in link is invalid or has expired.' }} />
        )}
        {deactivated && (
          <FormMessage state={{ error: 'Your account has been deactivated. Contact the administrator.' }} />
        )}
        {alreadyRegistered && (
          <div className="rounded-lg border border-primary/30 bg-primary/8 p-3 text-xs text-foreground">
            <p className="font-semibold text-primary">Account already registered</p>
            <p className="mt-0.5 text-muted-foreground">
              {prefilledEmail ? (
                <>
                  An account for <span className="font-mono font-semibold text-foreground">{prefilledEmail}</span> is already in our client list. Please sign in with your password or{' '}
                </>
              ) : (
                <>Your email is already registered. Please sign in or </>
              )}
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="font-semibold text-primary underline underline-offset-4"
              >
                reset your password
              </button>
              .
            </p>
          </div>
        )}

        {mode === 'signin' ? (
          <>
            <form action={signIn} className="space-y-3">
              <input type="hidden" name="next" value={nextPath} />
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={prefilledEmail}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-xs text-primary underline-offset-4 hover:underline"
                  >
                    Forgot / Reset password?
                  </button>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <FormMessage state={signInState} />
              <Button type="submit" className="w-full" disabled={signInPending}>
                {signInPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <Separator />

            {/* Smart Email Lookup: routes unregistered emails to /register and registered emails to login/reset */}
            <form action={checkEmail} className="space-y-2.5 rounded-xl border border-border/70 bg-muted/20 p-3">
              <input type="hidden" name="next" value={nextPath} />
              <div className="space-y-1">
                <Label htmlFor="lookup-email" className="flex items-center gap-1.5 text-xs font-semibold">
                  <MailCheck className="h-3.5 w-3.5 text-primary" />
                  Ordering a service? Check your email to continue
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  If your email is not in our client list, you&apos;ll be forwarded to registration; if already registered, you&apos;ll be prompted to sign in or reset your password.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  id="lookup-email"
                  name="email"
                  type="email"
                  defaultValue={prefilledEmail}
                  placeholder="Enter your email address…"
                  className="h-9 text-xs"
                  required
                />
                <Button type="submit" variant="secondary" size="sm" className="h-9 shrink-0" disabled={checkPending}>
                  {checkPending ? 'Checking…' : 'Continue'}
                </Button>
              </div>
              <FormMessage state={checkState} />
            </form>

            <Separator />

            <form action={magic} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="magic-email">Or get a one-time sign-in link</Label>
                <Input
                  id="magic-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={prefilledEmail}
                  required
                />
              </div>
              <FormMessage state={magicState} />
              <Button type="submit" variant="outline" className="w-full" disabled={magicPending}>
                {magicPending ? 'Sending…' : 'Email me a sign-in link'}
              </Button>
            </form>
          </>
        ) : (
          <>
            <form action={reset} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reset-email" className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-primary" />
                  Registered Email Address
                </Label>
                <Input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={prefilledEmail}
                  required
                />
              </div>
              <FormMessage state={resetState} />
              <Button type="submit" className="w-full" disabled={resetPending}>
                {resetPending ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
            <div className="text-center text-xs">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            </div>
          </>
        )}

        <p className="text-center text-xs text-muted-foreground">
          New client without an account?{' '}
          <Link href={registerHref} className="font-semibold text-primary underline underline-offset-4">
            Create a client account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>}>
      <LoginPageContent />
    </Suspense>
  );
}
