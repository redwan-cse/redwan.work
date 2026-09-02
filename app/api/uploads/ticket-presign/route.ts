import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  isR2Configured,
  makePendingAttachmentKey,
  makeTicketAttachmentKey,
  presignPrivatePut,
  validateContactFile,
} from '@/lib/r2';

const EXT_ALLOWED_MIMES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['application/msword'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

const presignRateMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 3;
const RATE_PRUNE_THRESHOLD = 5000;

function isRateLimited(sessionUserId: string): boolean {
  const now = Date.now();
  const stamps = (presignRateMap.get(sessionUserId) ?? []).filter((t: number) => t > now - RATE_WINDOW_MS);
  if (stamps.length >= RATE_MAX) {
    presignRateMap.set(sessionUserId, stamps);
    return true;
  }
  stamps.push(now);
  presignRateMap.set(sessionUserId, stamps);
  if (presignRateMap.size > RATE_PRUNE_THRESHOLD) {
    for (const [k, v] of Array.from(presignRateMap.entries())) {
      const filtered = (v as number[]).filter((t: number) => t > now - RATE_WINDOW_MS);
      if (filtered.length === 0) presignRateMap.delete(k);
      else presignRateMap.set(k, filtered);
    }
  }
  return false;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'client') {
      return jsonError('Unauthorized', 401);
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('is_active')
      .eq('id', session.userId)
      .maybeSingle();
    if (profile?.is_active !== true) {
      return jsonError('Unauthorized', 401);
    }

    if (isRateLimited(session.userId)) {
      return jsonError('Too many upload requests. Please try again later.', 429);
    }

    if (!isR2Configured()) {
      return jsonError('Attachments are temporarily unavailable. Please try again later.', 503);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid request.', 400);
    }

    const ticketIdRaw = (body as { ticketId?: unknown })?.ticketId ?? null;
    const ticketId: string | null =
      ticketIdRaw === null || ticketIdRaw === undefined ? null : String(ticketIdRaw).trim() || null;

    const filesRaw = (body as { files?: unknown })?.files;
    if (!Array.isArray(filesRaw) || filesRaw.length < 1 || filesRaw.length > 10) {
      return jsonError('Please attach between 1 and 10 files.', 400);
    }

    interface ValidatedFile {
      filename: string;
      mime: string;
      size: number;
      ext: string;
      normalizedMime: string;
    }
    const validated: ValidatedFile[] = [];

    for (const f of filesRaw) {
      if (
        typeof f !== 'object' ||
        f === null ||
        typeof (f as { filename?: unknown }).filename !== 'string' ||
        typeof (f as { mime?: unknown }).mime !== 'string' ||
        typeof (f as { size?: unknown }).size !== 'number'
      ) {
        return jsonError('Invalid request.', 400);
      }
      const candidate = f as { filename: string; mime: string; size: number };
      const check = validateContactFile(candidate);
      if (!check.ok) {
        return jsonError(check.error, 400);
      }
      const normalizedMime = candidate.mime.trim().toLowerCase().split(';')[0].trim();
      const allowedMimes = EXT_ALLOWED_MIMES[check.ext];
      if (!allowedMimes || !allowedMimes.includes(normalizedMime)) {
        return jsonError('File type does not match its extension.', 400);
      }
      validated.push({
        filename: candidate.filename,
        mime: normalizedMime,
        size: candidate.size,
        ext: check.ext,
        normalizedMime,
      });
    }

    // Ticket-scoped verification + cap
    if (ticketId !== null) {
      const { data: ticket, error: ticketError } = await admin
        .from('tickets')
        .select('id, client_id')
        .eq('id', ticketId)
        .maybeSingle();
      if (ticketError) {
        return jsonError(`Ticket lookup failed: ${ticketError.message}`, 500);
      }
      if (!ticket || (ticket as { client_id: string }).client_id !== session.userId) {
        return jsonError('Ticket not found.', 404);
      }

      const { count, error: countError } = await admin
        .from('files')
        .select('id', { count: 'exact', head: true })
        .eq('ticket_id', ticketId)
        .eq('kind', 'attachment');
      if (countError) {
        return jsonError(`Count failed: ${countError.message}`, 500);
      }
      if ((count ?? 0) + validated.length > 10) {
        return jsonError('A ticket can have at most 10 attachments.', 400);
      }
    }

    const uploads: Array<{ key: string; uploadUrl: string; filename: string }> = [];
    for (const file of validated) {
      let key: string;
      try {
        if (ticketId !== null) {
          key = makeTicketAttachmentKey(session.userId, ticketId, file.ext);
        } else {
          key = makePendingAttachmentKey(session.userId, file.ext);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, 400);
      }

      try {
        const uploadUrl = await presignPrivatePut(key, file.normalizedMime, file.size, 600);
        uploads.push({ key, uploadUrl, filename: file.filename });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, 500);
      }
    }

    return NextResponse.json({ uploads });
  } catch (error) {
    console.error('ticket-presign error:', error instanceof Error ? error.message : error);
    return jsonError('An error occurred while processing your request. Please try again.', 500);
  }
}
