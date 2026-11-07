'use client';

import Link from 'next/link';
import { Suspense, useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { acceptInviteAction, type ActionState } from '@/lib/auth/actions';

const initial: ActionState = {};

function InviteAcceptContent() {
  const searchParams = useSearchParams();
  const tokenHash = searchParams?.get('token_hash') ?? '';
  const email = searchParams?.get('email') ?? '';
  const [state, submit, pending] = useActionState(acceptInviteAction, initial);

  if (!tokenHash) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invalid invitation</CardTitle>
          <CardDescription>
            This invite link is missing its token.{' '}
            <Link href="/login" className="underline underline-offset-4 hover:text-primary">
              Back to sign in.
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome{email ? `, ${email}` : ''}</CardTitle>
        <CardDescription>
          Set a password to activate your account — at least 12 characters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-3">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </div>
          <FormMessage state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Activating…' : 'Activate account'}
          </Button>
          <div className="text-center text-xs">
            <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>}>
      <InviteAcceptContent />
    </Suspense>
  );
}
