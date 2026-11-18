import { requireAdminSession } from '@/lib/auth/session';
import { EmailsConsoleView } from '@/components/admin/emails-console-view';

export const dynamic = 'force-dynamic';

export default async function AdminEmailOutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  return (
    <EmailsConsoleView
      activeTab="outbox"
      statusFilter={params.status ?? ''}
      qFilter={params.q ?? ''}
    />
  );
}
