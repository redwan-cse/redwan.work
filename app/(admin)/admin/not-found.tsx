import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AdminNotFound() {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-start gap-4 py-12">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">Workspace item unavailable</h1>
      <p className="text-sm text-muted-foreground">This item could not be found or is not available to your account.</p>
      <Button asChild><Link href="/admin">Back to overview</Link></Button>
    </section>
  );
}
