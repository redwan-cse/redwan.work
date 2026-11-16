import { requireAdminSession } from '@/lib/auth/session';
import { ContentHubView } from '@/components/admin/content-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminResumeCmsPage() {
  await requireAdminSession();
  return <ContentHubView activeTab="resume" basePath="/admin/resume" />;
}
