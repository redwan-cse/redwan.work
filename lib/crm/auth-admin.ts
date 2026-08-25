import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

interface AuthUserLike {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
}

export async function findAuthUserByEmail(
  email: string
): Promise<{ id: string; email: string; role: string | undefined } | null> {
  const admin = getSupabaseAdmin();
  const target = email.trim().toLowerCase();
  const perPage = 200;

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth user lookup failed: ${error.message}`);

    const users = (data?.users ?? []) as AuthUserLike[];
    const match = users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (match) {
      const role = match.app_metadata?.['role'];
      return {
        id: match.id,
        email: match.email ?? target,
        role: typeof role === 'string' ? role : undefined,
      };
    }

    const total = data?.total ?? users.length;
    if (page * perPage >= total || users.length === 0) return null;
  }
}
