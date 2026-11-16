import { requireAdminSession } from '@/lib/auth/session';
import { PipelineHubView } from '@/components/admin/pipeline-hub-view';

export const dynamic = 'force-dynamic';

export default async function AdminProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; inquiry_id?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const activeTab = params.tab === 'inquiries' ? 'inquiries' : 'proposals';
  return <PipelineHubView activeTab={activeTab} inquiryId={params.inquiry_id} basePath="/admin/proposals" />;
}
