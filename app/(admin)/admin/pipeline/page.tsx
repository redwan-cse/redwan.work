import { requireAdminSession } from '@/lib/auth/session';
import { PipelineHubView } from '@/components/admin/pipeline-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminPipelineHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; inquiry_id?: string; status?: string; page?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const activeTab =
    params.tab === 'inquiries'
      ? 'inquiries'
      : params.tab === 'proposals' || params.inquiry_id
        ? 'proposals'
        : 'inquiries';
  return (
    <PipelineHubView
      activeTab={activeTab}
      inquiryId={params.inquiry_id}
      statusFilter={params.status ?? ''}
      pageParam={params.page}
      basePath="/admin/pipeline"
    />
  );
}
