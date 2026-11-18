import { redirect } from 'next/navigation';
import { requireAdminSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

// Blogs sync now lives inside the Content Studio hub; keep old links working.
export default async function AdminBlogsRedirectPage() {
  await requireAdminSession();
  redirect('/admin/content?tab=blogs');
}
