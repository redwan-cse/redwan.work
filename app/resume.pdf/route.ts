import type { NextRequest } from 'next/server';
import { serveStoredResumePdf } from '@/lib/resume/route-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<Response> {
  return serveStoredResumePdf(request, { robotsTag: 'index, follow' });
}
