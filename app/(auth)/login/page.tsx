'use client';

import Link from 'next/link';
import { Suspense, useActionState, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserPlus, LogIn, KeyRound, Sparkles, Lock, ArrowRight } from 'lucide-react';
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
import {
  signInWithPasswordAction,
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
  const [email, setEmail] = useState(prefilledEmail);
  const [expanded, setExpanded] = useState(Boolean(prefilledEmail));
  const [authMethod, setAuthMethod] = useState<'password' | 'magic'>('password');
  const [phaseError, setPhaseError] = useState('');

  const [signInState, signIn, signInPending] = useActionState(signInWithPasswordAction, initial);
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
    const targetEmail = email.trim() || prefilledEmail;
    if (targetEmail) params.set('email', targetEmail);
    if (nextPath) params.set('next', nextPath);
    const qs = params.toString();
    return qs ? `/register?${qs}` : '/register';
  })();

  const handleContinue = () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setPhaseError('Please enter a valid email address to continue.');
      return;
    }
    setPhaseError('');
    setExpanded(true);
  };

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
              ? 'Enter your email address to sign in with your password or a one-time link.'
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
                  An account for <span className="font-mono font-semibold text-foreground">{prefilledEmail}</span> is already in our client list. Please sign in below or{' '}
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
          <div className="space-y-4">
            <form
              action={authMethod === 'password' ? signIn : magic}
              className="space-y-3.5"
            >
              <input type="hidden" name="next" value={nextPath} />

              {/* Phase 1: Single Email Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="email">Email</Label>
                  {expanded && (
                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(false);
                        setPhaseError('');
                      }}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      Change
                    </button>
                  )}
                </div>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (phaseError) setPhaseError('');
                  }}
                  onKeyDown={(e) => {
                    if (!expanded && e.key === 'Enter') {
                      e.preventDefault();
                      handleContinue();
                    }
                  }}
                  required
                />
              </div>

              {phaseError && <FormMessage state={{ error: phaseError }} />}

              {!expanded && (
                <Button
                  type="button"
                  className="w-full gap-1.5"
                  onClick={handleContinue}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}

              {/* Phase 2: Expands after Continue (or on programmatic focus/fill) */}
              <div className={expanded ? 'space-y-3.5 pt-1' : 'sr-only'}>
                {/* Method Switcher Tabs (Password by default vs One-Time Link) */}
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border/70 bg-muted/25 p-1">
                  <button
                    type="button"
                    onClick={() => setAuthMethod('password')}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                      authMethod === 'password'
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMethod('magic')}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                      authMethod === 'magic'
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    One-Time Link
                  </button>
                </div>

                {authMethod === 'password' ? (
                  <div className="space-y-3">
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
                        onFocus={() => setExpanded(true)}
                        onChange={() => setExpanded(true)}
                        required={authMethod === 'password'}
                      />
                    </div>
                    <FormMessage state={signInState} />
                    <Button type="submit" className="w-full" disabled={signInPending}>
                      {signInPending ? 'Signing in…' : 'Sign in'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      We&apos;ll send a single-use sign-in link to{' '}
                      <span className="font-mono font-medium text-foreground">
                        {email || 'your email'}
                      </span>
                      .
                    </p>
                    <FormMessage state={magicState} />
                    <Button
                      type="submit"
                      variant="default"
                      className="w-full"
                      disabled={magicPending}
                    >
                      {magicPending ? 'Sending…' : 'Email me a sign-in link'}
                    </Button>
                  </div>
                )}
              </div>
            </form>
          </div>
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
