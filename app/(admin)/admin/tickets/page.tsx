import { requireAdminSession } from '@/lib/auth/session';
import { SupportHubView } from '@/components/admin/support-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; priority?: string; page?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const activeTab = params.tab === 'reviews' ? 'reviews' : 'tickets';
  return (
    <SupportHubView
      activeTab={activeTab}
      statusFilter={params.status ?? ''}
      priorityFilter={params.priority ?? ''}
      pageParam={params.page}
      basePath="/admin/tickets"
    />
  );
}
