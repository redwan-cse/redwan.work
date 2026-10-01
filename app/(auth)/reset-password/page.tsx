'use client';

import Link from 'next/link';
import { useActionState } from 'react';
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
import { setNewPasswordFromRecoveryAction, type ActionState } from '@/lib/auth/actions';

const initial: ActionState = {};

function searchParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) ?? '';
}

export default function ResetPasswordPage() {
  const tokenHash = searchParam('token_hash');
  const [state, submit, pending] = useActionState(setNewPasswordFromRecoveryAction, initial);

  if (!tokenHash) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invalid link</CardTitle>
          <CardDescription>
            This password-reset link is missing its token.{' '}
            <Link href="/login" className="underline underline-offset-4 hover:text-primary">
              Request a new one from the sign-in page.
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>
          Pick something long and unique — at least 12 characters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-3">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
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
            <Label htmlFor="confirm">Confirm new password</Label>
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
            {pending ? 'Saving…' : 'Save new password'}
          </Button>
          <div className="text-center text-xs">
            <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
              Need a new reset link? Back to sign in
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
