import { NextRequest, NextResponse } from 'next/server';
import { requireBearer } from '@/lib/auth/bearer';
import { drainEmailOutbox } from '@/lib/email/outbox';

export const dynamic = 'force-dynamic';

async function handleEmailOutboxCron(request: NextRequest) {
  if (!requireBearer(process.env.CRON_SECRET, request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email dispatch service is not configured' }, { status: 503 });
  }

  try {
    const counts = await drainEmailOutbox(20);
    return NextResponse.json({
      ok: true,
      accepted: counts.accepted,
      deferred: counts.deferred,
      failed: counts.failed,
      sentCount: counts.accepted,
      failedCount: counts.failed,
    });
  } catch (err) {
    console.error('Email outbox cron failed:', err);
    return NextResponse.json({ error: 'Failed to process email outbox' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleEmailOutboxCron(request);
}

export async function POST(request: NextRequest) {
  return handleEmailOutboxCron(request);
}
