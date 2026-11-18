import { requireAdminSession } from '@/lib/auth/session';
import { BillingHubView } from '@/components/admin/billing-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminBillingHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const activeTab = params.tab === 'retainers' ? 'retainers' : 'invoices';
  return (
    <BillingHubView
      activeTab={activeTab}
      statusFilter={params.status ?? ''}
      basePath="/admin/billing"
      pageParam={params.page}
    />
  );
}
