'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus } from 'lucide-react';
import { inviteClientAction, setClientActiveAction } from '@/lib/crm/admin-actions';

export function InviteClientButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onInvite(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const state = await inviteClientAction({}, formData);
      if (state.error) {
        setError(state.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <UserPlus className="size-3.5" /> Invite client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite a client</DialogTitle>
          <DialogDescription>
            They will receive an email invitation to set a password and activate their portal
            account.
          </DialogDescription>
        </DialogHeader>
        <form action={onInvite} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-full-name">Full name</Label>
            <Input id="invite-full-name" name="fullName" autoComplete="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-company">Company</Label>
            <Input id="invite-company" name="company" autoComplete="organization" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Sending…' : 'Send invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClientActiveButton({
  clientId,
  isActive,
}: {
  clientId: string;
  isActive: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      const state = await setClientActiveAction(clientId, !isActive);
      if (state.error) {
        setError(state.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center justify-end gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" variant="outline" onClick={toggleActive} disabled={pending}>
        {isActive ? 'Deactivate' : 'Reactivate'}
      </Button>
    </span>
  );
}
