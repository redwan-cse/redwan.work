'use client';

import { useActionState } from 'react';
import { KeyRound } from 'lucide-react';
import { changeAuthenticatedPasswordAction, type ActionState } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initialState: ActionState = {};

export function PasswordChangeCard() {
  const [state, formAction, pending] = useActionState(
    changeAuthenticatedPasswordAction,
    initialState
  );

  return (
    <Card className="border-border/80 bg-card/85">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <KeyRound className="h-4 w-4 text-primary" />
          Password &amp; Security
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col justify-end gap-1.5">
              <Label htmlFor="new-password" className="mb-auto text-xs">
                New Password (min 12 chars) *
              </Label>
              <Input
                id="new-password"
                name="password"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="h-9 text-xs"
              />
            </div>
            <div className="flex flex-col justify-end gap-1.5">
              <Label htmlFor="confirm-password" className="mb-auto text-xs">
                Confirm New Password *
              </Label>
              <Input
                id="confirm-password"
                name="confirm"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="h-9 text-xs"
              />
            </div>
          </div>

          {state.error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {state.error}
            </p>
          )}
          {state.notice && (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
              {state.notice}
            </p>
          )}

          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? 'Updating Password…' : 'Update Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
