import Link from 'next/link';
import { FolderSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PortalNotFound() {
  return (
    <div className="flex min-h-[55dvh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted/40">
        <FolderSearch className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Resource not found</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This order, invoice, proposal, or support thread does not exist or belongs to a different account.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="rounded-full">
          <Link href="/portal">Back to Workspace Overview</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href="/portal/orders">View My Orders</Link>
        </Button>
      </div>
    </div>
  );
}
