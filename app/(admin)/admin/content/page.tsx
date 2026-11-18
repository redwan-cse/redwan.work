import { requireAdminSession } from '@/lib/auth/session';
import { ContentHubView } from '@/components/admin/content-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminContentStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const activeTab =
    params.tab === 'portfolio' ||
    params.tab === 'resume' ||
    params.tab === 'assets' ||
    params.tab === 'blogs'
      ? params.tab
      : 'services';

  return <ContentHubView activeTab={activeTab} basePath="/admin/content" />;
}
