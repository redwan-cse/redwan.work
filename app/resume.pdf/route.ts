import type { NextRequest } from 'next/server';
import { serveDynamicResumePdf } from '@/lib/resume/route-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<Response> {
  return serveDynamicResumePdf(request, { robotsTag: 'index, follow' });
}
