import 'server-only';
import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isR2Configured, makePendingAttachmentKey, makeTicketAttachmentKey, presignPrivatePut, validateContactFile, verifyStoredObjectSize } from '@/lib/r2';

export interface AttachmentEntry { key: string; filename: string; mime: string; size_bytes: number; }
export const ATTACHMENT_ERROR = 'Attachment data is invalid. Please re-upload your files.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validUuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }

export async function validateAttachments(entries: unknown, ownerId: string, ticketId: string | null): Promise<AttachmentEntry[] | null> {
  if (!validUuid(ownerId) || (ticketId !== null && !validUuid(ticketId)) || !Array.isArray(entries) || entries.length > 10) return null;
  const seen = new Set<string>();
  const result: AttachmentEntry[] = [];
  const prefix = `private/${ownerId}/${ticketId ? `ticket_${ticketId}` : 'pending'}/`;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') return null;
    const { key, filename, mime, size_bytes } = entry;
    if (typeof key !== 'string' || !key.startsWith(prefix) || seen.has(key) || !/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(key.slice(prefix.length))) return null;
    const check = validateContactFile({ filename, mime, size: size_bytes });
    if (!check.ok || !key.endsWith(`.${check.ext}`)) return null;
    seen.add(key);
    result.push({ key, filename, mime: mime.trim().toLowerCase().split(';')[0].trim(), size_bytes });
  }
  // All structural validation precedes all HEAD requests; no writes occur here.
  try {
    for (const entry of result) if (!await verifyStoredObjectSize(entry.key, entry.size_bytes)) return null;
  } catch { return null; }
  return result;
}

export async function prepareTicketUploads(actor: { userId: string; role: 'admin' | 'client' }, ticketId: unknown, files: unknown): Promise<{ ok: true; uploads: Array<{ key: string; uploadUrl: string; filename: string }> } | { ok: false; error: string; status: number }> {
  const fail = (error: string, status: number) => ({ ok: false as const, error, status });
  if (!validUuid(actor.userId) || (ticketId !== null && !validUuid(ticketId)) || !Array.isArray(files) || files.length < 1 || files.length > 10) return fail('Invalid attachment request.', 400);
  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin.from('profiles').select('role, is_active').eq('id', actor.userId).maybeSingle();
  if (profileError || !profile || profile.is_active !== true || profile.role !== actor.role) return fail('Unauthorized.', 401);
  if (actor.role === 'admin' && ticketId === null) return fail('Choose a ticket first.', 400);
  let owner = actor.userId;
  if (ticketId !== null) {
    const { data: ticket, error } = await admin.from('tickets').select('client_id').eq('id', ticketId).maybeSingle();
    if (error || !ticket || (actor.role !== 'admin' && ticket.client_id !== actor.userId)) return fail('Ticket not found.', 404);
    owner = ticket.client_id;
    const { count, error: countError } = await admin.from('files').select('id', { count: 'exact', head: true }).eq('ticket_id', ticketId).eq('kind', 'attachment');
    if (countError || count === null) return fail('Attachments are temporarily unavailable.', 503);
    if (count + files.length > 10) return fail('A ticket can have at most 10 attachments.', 400);
  }
  const validated = [];
  for (const f of files) {
    const check = validateContactFile(f);
    if (!check.ok) return fail(check.error, 400);
    validated.push({ filename: f.filename as string, mime: (f.mime as string).trim().toLowerCase().split(';')[0].trim(), size: f.size as number, ext: check.ext });
  }
  const salt = process.env.LEAD_IP_HASH_SALT;
  if (!salt || !isR2Configured()) return fail('Attachments are temporarily unavailable.', 503);
  try {
    const { data, error } = await admin.rpc('consume_rate_limit', { p_kind: 'presign-portal', p_key_hash: createHash('sha256').update(salt + actor.userId).digest('hex'), p_window_seconds: 60, p_max_count: 3 });
    if (error || typeof data !== 'boolean') return fail('Attachments are temporarily unavailable.', 503);
    if (!data) return fail('Too many upload requests. Please try again later.', 429);
    const uploads = [];
    for (const file of validated) {
      const key = ticketId ? makeTicketAttachmentKey(owner, ticketId, file.ext) : makePendingAttachmentKey(owner, file.ext);
      uploads.push({ key, filename: file.filename, uploadUrl: await presignPrivatePut(key, file.mime, file.size, 600) });
    }
    return { ok: true, uploads };
  } catch { return fail('Attachments are temporarily unavailable.', 503); }
}
