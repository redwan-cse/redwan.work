import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { prepareTicketUploads } from '@/lib/crm/attachments';

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    const sameOrigin = origin ? new URL(origin).host === request.headers.get('host') : ['same-origin','none'].includes(request.headers.get('sec-fetch-site') ?? '');
    if (!sameOrigin) return NextResponse.json({ error: 'Request origin not allowed.' }, { status: 403 });
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    const input = body as { ticketId?: unknown; files?: unknown };
    const result = await prepareTicketUploads(session, input.ticketId ?? null, input.files);
    return result.ok ? NextResponse.json({ uploads: result.uploads }) : NextResponse.json({ error: result.error }, { status: result.status });
  } catch {
    console.error('Ticket upload preparation failed.');
    return NextResponse.json({ error: 'Attachments are temporarily unavailable.' }, { status: 503 });
  }
}
