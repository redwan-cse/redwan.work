'use client';

import { useActionState } from 'react';
import { KeyRound } from 'lucide-react';
import { changePasswordAction, type PasswordChangeState } from '@/lib/auth/password-change';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initialState: PasswordChangeState = {};

export function PasswordChangeCard() {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
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
          <div className="flex flex-col justify-end gap-1.5">
            <Label htmlFor="current-password" className="text-xs">
              Current Password *
            </Label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Enter current password"
              className="h-10 md:h-9"
            />
          </div>
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
                className="h-10 md:h-9"
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
                className="h-10 md:h-9"
              />
            </div>
          </div>

          {state.error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {state.error}
            </p>
          )}
          {state.notice && (
            <p role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
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
