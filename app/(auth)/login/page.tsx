'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
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
  requestMagicLinkAction,
  requestPasswordResetAction,
  consumeMagicLinkTokenAction,
  type ActionState,
} from '@/lib/auth/actions';

const initial: ActionState = {};

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');

  const [signInState, signIn, signInPending] = useActionState(signInWithPasswordAction, initial);
  const [magicState, magic, magicPending] = useActionState(requestMagicLinkAction, initial);
  const [resetState, reset, resetPending] = useActionState(requestPasswordResetAction, initial);

  const searchParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const nextPath = searchParams?.get('next') ?? '';

  const tokenHash = searchParams?.get('token_hash') ?? '';
  const tokenType = searchParams?.get('type');

  const [tokenState, setTokenState] = useState<'idle' | 'working' | 'failed'>(
    tokenHash && tokenType === 'magiclink' ? 'working' : 'idle'
  );

  useEffect(() => {
    if (tokenState !== 'working') return;
    let cancelled = false;
    consumeMagicLinkTokenAction(tokenHash).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        window.location.assign(result.home);
      } else {
        setTokenState('failed');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tokenState, tokenHash]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>
          {mode === 'signin'
            ? 'Admin and client access. Accounts are created by invitation only.'
            : 'We will email you a password reset link if the address has an account.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tokenState === 'working' && (
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        )}
        {tokenState === 'failed' && (
          <FormMessage state={{ error: 'That sign-in link is invalid or has expired.' }} />
        )}
        {mode === 'signin' ? (
          <>
            <form action={signIn} className="space-y-3">
              <input type="hidden" name="next" value={nextPath} />
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
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

            <div className="text-center text-xs">
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <Separator />

            <form action={magic} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="magic-email">Or get a one-time sign-in link</Label>
                <Input id="magic-email" name="email" type="email" required />
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
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" name="email" type="email" required />
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
          Need an account?{' '}
          <Link href="/contact" className="underline-offset-4 hover:underline">
            Become a client
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
