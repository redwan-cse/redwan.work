import { requireAdminSession } from '@/lib/auth/session';
import { ContentHubView } from '@/components/admin/content-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminServicesCmsPage() {
  await requireAdminSession();
  return <ContentHubView activeTab="services" basePath="/admin/services" />;
}
