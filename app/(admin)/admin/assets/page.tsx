import { redirect } from 'next/navigation';
import { requireAdminSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

// Public R2 assets now live inside the Content Studio hub; keep old links working.
export default async function AdminPublicAssetsRedirectPage() {
  await requireAdminSession();
  redirect('/admin/content?tab=assets');
}
