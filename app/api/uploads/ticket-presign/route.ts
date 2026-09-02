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
import { sha256Hex } from '@/lib/contact/lead-schema';

const EXT_ALLOWED_MIMES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['application/msword'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host');
  const origin = request.headers.get('origin');

  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  return fetchSite === 'same-origin' || fetchSite === 'none';
}

async function consumeDbRateLimit(
  kind: string,
  keyHash: string,
  windowSeconds: number,
  maxCount: number
): Promise<boolean | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    const { data, error } = await getSupabaseAdmin().rpc('consume_rate_limit', {
      p_kind: kind,
      p_key_hash: keyHash,
      p_window_seconds: windowSeconds,
      p_max_count: maxCount,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    console.error('DB rate limit unavailable:', err instanceof Error ? err.message : err);
    return null;
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) {
      console.warn('ticket-presign rejected: cross-origin request');
      return jsonError('Request origin not allowed.', 403);
    }

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

    const salt = process.env.LEAD_IP_HASH_SALT;
    if (!salt) {
      console.error('LEAD_IP_HASH_SALT missing');
      return jsonError('Attachments are temporarily unavailable.', 503);
    }
    const keyHash = await sha256Hex(salt + session.userId);
    const allowed = await consumeDbRateLimit('presign-portal', keyHash, 60, 3);
    if (allowed === null) {
      return jsonError('Attachments are temporarily unavailable.', 503);
    }
    if (allowed === false) {
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

    if (ticketId !== null) {
      const { data: ticket, error: ticketError } = await admin
        .from('tickets')
        .select('id, client_id')
        .eq('id', ticketId)
        .maybeSingle();
      if (ticketError) {
        console.error('Ticket lookup error:', ticketError.message);
        return jsonError('Ticket not found.', 404);
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
        console.error('Count error:', countError.message);
        return jsonError('A ticket can have at most 10 attachments.', 400);
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
        console.error('Key generation error:', e instanceof Error ? e.message : e);
        return jsonError('Attachment request failed.', 400);
      }

      try {
        const uploadUrl = await presignPrivatePut(key, file.normalizedMime, file.size, 600);
        uploads.push({ key, uploadUrl, filename: file.filename });
      } catch (e) {
        console.error('Presign error:', e instanceof Error ? e.message : e);
        return jsonError('Attachment request failed.', 500);
      }
    }

    return NextResponse.json({ uploads });
  } catch (error) {
    console.error('ticket-presign error:', error instanceof Error ? error.message : error);
    return jsonError('An error occurred while processing your request. Please try again.', 500);
  }
}