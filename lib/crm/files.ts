import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { crmError, type CrmResult } from '@/lib/crm/result';
import { isPortalKey, isValidContactKey, presignPrivateGet, deletePrivateObjects } from '@/lib/r2';

export interface FileRow {
  id: string;
  bucket: 'public' | 'private';
  r2_key: string;
  kind: 'attachment' | 'deliverable' | 'asset';
  ticket_id: string | null;
  project_id: string | null;
  filename: string;
  mime: string;
  size_bytes: number;
  created_at: string;
  uploaded_by: string;
}

export async function createFileRow(input: {
  bucket: 'private';
  r2_key: string;
  kind: 'attachment' | 'deliverable';
  ticket_id?: string;
  project_id?: string;
  uploaded_by: string;
  filename: string;
  mime: string;
  size_bytes: number;
}): Promise<CrmResult> {
  if (input.bucket !== 'private') return crmError('Invalid bucket.');
  if (!isValidContactKey(input.r2_key) && !isPortalKey(input.r2_key)) return crmError('Invalid file key.');
  if (!input.uploaded_by) return crmError('Missing uploader.');
  if (!input.filename || input.filename.trim().length < 1 || input.filename.length > 255) return crmError('Invalid filename.');
  if (!input.mime || input.mime.length < 1 || input.mime.length > 128) return crmError('Invalid mime type.');
  if (!Number.isFinite(input.size_bytes) || input.size_bytes < 0) return crmError('Invalid file size.');

  if (input.kind === 'attachment') {
    if (input.project_id) return crmError('Attachment must not have project_id.');
    const isPending = input.r2_key.includes('/pending/');
    if (!input.ticket_id && !isPending) return crmError('Attachment requires ticket_id.');
    if (input.ticket_id && isPending) return crmError('Pending attachment must not have ticket_id.');
  } else if (input.kind === 'deliverable') {
    if (!input.project_id) return crmError('Deliverable requires project_id.');
    if (input.ticket_id) return crmError('Deliverable must not have ticket_id.');
  } else {
    return crmError('Invalid file kind.');
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('files').insert({
    bucket: input.bucket,
    r2_key: input.r2_key,
    kind: input.kind,
    ticket_id: input.ticket_id ?? null,
    project_id: input.project_id ?? null,
    uploaded_by: input.uploaded_by,
    filename: input.filename,
    mime: input.mime,
    size_bytes: input.size_bytes,
  });

  if (error) return crmError(`Could not save file: ${error.message}`);
  return { ok: true };
}

export async function getOwnedFileUrl(
  fileId: string,
  viewer: { userId: string; role: 'admin' | 'client' }
): Promise<{ ok: true; url: string; filename: string } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();
  const { data: file, error } = await admin
    .from('files')
    .select('id, r2_key, kind, ticket_id, project_id, filename')
    .eq('id', fileId)
    .maybeSingle();

  if (error) return { ok: false, error: `File lookup failed: ${error.message}` };
  if (!file) return { ok: false, error: 'File not found.' };

  const typed = file as Pick<FileRow, 'id' | 'r2_key' | 'kind' | 'ticket_id' | 'project_id' | 'filename'>;

  if (viewer.role !== 'admin') {
    let allowed = false;
    if (typed.kind === 'deliverable' && typed.project_id) {
      const { data: proj } = await admin
        .from('projects')
        .select('id')
        .eq('id', typed.project_id)
        .eq('client_id', viewer.userId)
        .maybeSingle();
      if (proj) allowed = true;
    } else if (typed.kind === 'attachment' && typed.ticket_id) {
      const { data: ticket } = await admin
        .from('tickets')
        .select('id')
        .eq('id', typed.ticket_id)
        .eq('client_id', viewer.userId)
        .maybeSingle();
      if (ticket) allowed = true;
    } else if (typed.kind === 'attachment' && !typed.ticket_id) {
      // pending: only uploader can access – check uploaded_by
      const { data: full } = await admin.from('files').select('uploaded_by').eq('id', fileId).maybeSingle();
      if ((full as { uploaded_by: string } | null)?.uploaded_by === viewer.userId) allowed = true;
    }
    if (!allowed) return { ok: false, error: 'File not found.' };
  }

  try {
    const url = await presignPrivateGet(typed.r2_key, 60);
    return { ok: true, url, filename: typed.filename };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function deleteOwnedFile(
  fileId: string,
  viewer: { userId: string; role: 'admin' | 'client' }
): Promise<CrmResult> {
  const admin = getSupabaseAdmin();
  const { data: file, error } = await admin
    .from('files')
    .select('id, r2_key, kind, ticket_id, project_id, created_at, uploaded_by')
    .eq('id', fileId)
    .maybeSingle();

  if (error) return crmError(`File lookup failed: ${error.message}`);
  if (!file) return crmError('File not found.');

  const typed = file as FileRow;

  if (viewer.role === 'admin') {
    try {
      await deletePrivateObjects([typed.r2_key]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return crmError(`Storage delete failed: ${msg}`);
    }
    const { error: delError } = await admin.from('files').delete().eq('id', fileId);
    if (delError) return crmError(`Delete failed: ${delError.message}`);
    return { ok: true };
  }

  // client path
  if (typed.kind !== 'attachment') return crmError('Only attachments can be deleted.');
  if (typed.uploaded_by !== viewer.userId) return crmError('File not found.');

  // scope check: ticket must belong to viewer if ticket_id present
  if (typed.ticket_id) {
    const { data: ticket } = await admin
      .from('tickets')
      .select('id')
      .eq('id', typed.ticket_id)
      .eq('client_id', viewer.userId)
      .maybeSingle();
    if (!ticket) return crmError('File not found.');
  }

  const ageMs = Date.now() - new Date(typed.created_at).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return crmError('Delete window expired.');

  try {
    await deletePrivateObjects([typed.r2_key]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return crmError(`Storage delete failed: ${msg}`);
  }

  const { error: delError } = await admin.from('files').delete().eq('id', fileId);
  if (delError) return crmError(`Delete failed: ${delError.message}`);
  return { ok: true };
}

export async function listTicketAttachmentRows(ticketId: string): Promise<FileRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('files')
    .select('id, bucket, r2_key, kind, ticket_id, project_id, filename, mime, size_bytes, created_at, uploaded_by')
    .eq('ticket_id', ticketId)
    .eq('kind', 'attachment')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`ticket attachments query failed: ${error.message}`);
  return (data ?? []) as FileRow[];
}

export async function listOwnDeliverables(clientId: string): Promise<Array<FileRow & { project_name: string }>> {
  const admin = getSupabaseAdmin();
  const { data: projects, error: projError } = await admin
    .from('projects')
    .select('id, name')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('name', { ascending: true });

  if (projError) throw new Error(`projects lookup failed: ${projError.message}`);
  const projectMap = new Map<string, string>();
  for (const p of (projects ?? []) as Array<{ id: string; name: string }>) {
    projectMap.set(p.id, p.name);
  }
  if (projectMap.size === 0) return [];

  const ids = Array.from(projectMap.keys());
  const { data: files, error: fileError } = await admin
    .from('files')
    .select('id, bucket, r2_key, kind, ticket_id, project_id, filename, mime, size_bytes, created_at, uploaded_by')
    .eq('kind', 'deliverable')
    .in('project_id', ids)
    .order('created_at', { ascending: true });

  if (fileError) throw new Error(`deliverables query failed: ${fileError.message}`);

  const out: Array<FileRow & { project_name: string }> = [];
  for (const f of (files ?? []) as FileRow[]) {
    const name = f.project_id ? projectMap.get(f.project_id) ?? '' : '';
    out.push({ ...f, project_name: name });
  }

  // order by project name then created_at already per project name group; sort explicitly
  out.sort((a, b) => {
    const cmp = a.project_name.localeCompare(b.project_name);
    if (cmp !== 0) return cmp;
    return a.created_at.localeCompare(b.created_at);
  });

  return out;
}

export async function countPendingAttachmentOrphans(): Promise<{ rows: number; keys: string[] }> {
  const admin = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('files')
    .select('r2_key')
    .eq('kind', 'attachment')
    .is('ticket_id', null)
    .lt('created_at', cutoff);

  if (error) throw new Error(`orphan count failed: ${error.message}`);
  const keys = ((data ?? []) as Array<{ r2_key: string }>).map((r) => r.r2_key);
  return { rows: keys.length, keys };
}
