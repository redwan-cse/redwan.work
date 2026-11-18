import { requireAdminSession } from '@/lib/auth/session';
import { ContentHubView } from '@/components/admin/content-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminPortfolioCmsPage() {
  await requireAdminSession();
  return <ContentHubView activeTab="portfolio" basePath="/admin/portfolio" />;
}
