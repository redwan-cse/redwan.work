'use client';

import Link from 'next/link';
import { Suspense, useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserPlus, ArrowRight, LogIn } from 'lucide-react';
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
  registerClientAccountAction,
  type ActionState,
} from '@/lib/auth/actions';

const initial: ActionState = {};

function RegisterPageContent() {
  const [state, registerAction, pending] = useActionState(
    registerClientAccountAction,
    initial
  );
  const searchParams = useSearchParams();
  const nextPath = searchParams?.get('next') ?? '';
  const prefilledEmail = searchParams?.get('email') ?? '';

  const loginHref = (() => {
    const params = new URLSearchParams();
    if (prefilledEmail) params.set('email', prefilledEmail);
    if (nextPath) params.set('next', nextPath);
    const qs = params.toString();
    return qs ? `/login?${qs}` : '/login';
  })();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-primary">
          <UserPlus className="h-5 w-5" />
          <CardTitle className="text-xl">Client Registration</CardTitle>
        </div>
        <CardDescription>
          Create your encrypted Client Portal account to place service orders, review proposals, sign Rules of Engagement, and download deliverables.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {prefilledEmail && (
          <div className="rounded-lg border border-primary/30 bg-primary/8 p-3 text-xs text-foreground">
            No registered client account was found for{' '}
            <span className="font-mono font-semibold text-primary">{prefilledEmail}</span>.
            Complete your registration below to continue.
          </div>
        )}

        <form action={registerAction} className="space-y-3">
          <input type="hidden" name="next" value={nextPath} />

          <div className="space-y-1.5">
            <Label htmlFor="full_name">
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              placeholder="Elena Vance"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">
              Email Address <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={prefilledEmail}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="company_name">
                Company <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="company_name"
                name="company_name"
                type="text"
                autoComplete="organization"
                placeholder="Acme Corp"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">
                Phone / WhatsApp <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+1 555 010 9988"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">
              Password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              placeholder="At least 12 characters"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">
              Confirm Password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              placeholder="Re-enter your password"
              required
            />
          </div>

          <FormMessage state={state} />

          <Button type="submit" className="w-full gap-1.5" disabled={pending}>
            {pending ? 'Creating client account…' : 'Create Client Account & Continue'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        <Separator />

        <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
          <p>Already have a Client Portal account?</p>
          <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
            <Link href={loginHref}>
              <LogIn className="h-3.5 w-3.5" />
              Sign In or Reset Password
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Loading registration…
          </CardContent>
        </Card>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}
