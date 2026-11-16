import { requireAdminSession } from '@/lib/auth/session';
import { SupportHubView } from '@/components/admin/support-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; priority?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const activeTab = params.tab === 'tickets' ? 'tickets' : 'reviews';
  return (
    <SupportHubView
      activeTab={activeTab}
      statusFilter={params.status ?? ''}
      priorityFilter={params.priority ?? ''}
      basePath="/admin/reviews"
    />
  );
}
