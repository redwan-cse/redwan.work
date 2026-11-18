import { requireAdminSession } from '@/lib/auth/session';
import { BillingHubView } from '@/components/admin/billing-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminRetainersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const activeTab = params.tab === 'invoices' ? 'invoices' : 'retainers';
  return (
    <BillingHubView
      activeTab={activeTab}
      statusFilter={params.status ?? ''}
      pageParam={params.page}
      basePath="/admin/retainers"
    />
  );
}
