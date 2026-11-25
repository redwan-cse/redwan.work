import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdminSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { MultiLineInvoiceComposer } from '@/components/admin/multi-line-invoice-composer';

export const dynamic = 'force-dynamic';

export default async function AdminNewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; order_id?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const admin = getSupabaseAdmin();

  const [{ data: clients }, { data: orders }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').eq('role', 'client').order('created_at', { ascending: false }),
    admin.from('orders').select('id, code, title, client_id').order('created_at', { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/billing"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to Billing Hub
        </Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Create Multi-Line Invoice</h1>
      </div>

      <MultiLineInvoiceComposer
        clients={clients ?? []}
        orders={orders ?? []}
        defaultClientId={params.client_id ?? ''}
        defaultOrderId={params.order_id ?? ''}
      />
    </div>
  );
}
