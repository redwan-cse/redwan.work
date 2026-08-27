import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getOwnedFileUrl } from '@/lib/crm/files';

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  const result = await getOwnedFileUrl(id, { userId: session.userId, role: session.role });

  if (!result.ok) {
    // No existence leak: every failure is 404-style for the caller
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  // 60s presigned GET — browser follows 302 to R2. The presigned URL lacks
  // Content-Disposition with the original filename; browser will use the key
  // basename. Acceptable per spec.
  return NextResponse.redirect(result.url, 302);
}
