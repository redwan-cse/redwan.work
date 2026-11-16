import { requireAdminSession } from '@/lib/auth/session';
import { OpsHubView } from '@/components/admin/ops-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminOpsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; q?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  return <OpsHubView actionFilter={params.action ?? ''} qFilter={params.q ?? ''} />;
}
