'use client';

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
import { acceptInviteAction, type ActionState } from '@/lib/auth/actions';

const initial: ActionState = {};

function searchParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) ?? '';
}

export default function InviteAcceptPage() {
  const tokenHash = searchParam('token_hash');
  const email = searchParam('email');
  const [state, submit, pending] = useActionState(acceptInviteAction, initial);

  if (!tokenHash) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invalid invitation</CardTitle>
          <CardDescription>
            This invite link is missing its token. Ask the administrator to resend it.
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
        </form>
      </CardContent>
    </Card>
  );
}
