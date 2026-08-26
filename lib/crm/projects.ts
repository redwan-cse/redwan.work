import 'server-only';

import * as archiverNS from 'archiver';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { crmError, type CrmResult } from '@/lib/crm/result';
import {
  ARCHIVE_MAX_BYTES,
  deletePrivateObjects,
  getPrivateObjectBytes,
  presignPrivateGet,
  putPrivateObject,
} from '@/lib/r2';
import type { FileRow } from '@/lib/crm/files';

export type ProjectStatus = 'active' | 'paused' | 'done';

export interface ProjectRow {
  id: string;
  client_id: string;
  client_name: string | null;
  client_email: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  started_at: string;
  due_at: string | null;
  archived_at: string | null;
  archive_key: string | null;
  milestone_total: number;
  milestone_done: number;
  file_count: number;
}

export interface MilestoneRow {
  id: string;
  project_id: string;
  title: string;
  amount_cents: number;
  currency: string;
  position: number;
  status: 'pending' | 'in_progress' | 'done';
}

export interface PortalProjectRow {
  id: string;
  name: string;
  status: ProjectStatus;
  due_at: string | null;
  milestone_total: number;
  milestone_done: number;
}

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'done'];
const MILESTONE_STATUSES = ['pending', 'in_progress', 'done'] as const;
const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isProjectStatus(v: unknown): v is ProjectStatus {
  return typeof v === 'string' && PROJECT_STATUSES.includes(v as ProjectStatus);
}

function isMilestoneStatus(v: unknown): v is (typeof MILESTONE_STATUSES)[number] {
  return typeof v === 'string' && (MILESTONE_STATUSES as readonly string[]).includes(v as string);
}

function isValidDueDate(v: string): boolean {
  if (!DUE_RE.test(v)) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

async function hydrateProjectRow(raw: {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  started_at: string;
  due_at: string | null;
  archived_at: string | null;
  archive_key: string | null;
}): Promise<ProjectRow> {
  const admin = getSupabaseAdmin();

  const [{ data: profile }, { data: userData }, { count: milestone_total }, { count: milestone_done }, { count: file_count }] =
    await Promise.all([
      admin.from('profiles').select('full_name').eq('id', raw.client_id).maybeSingle(),
      admin.auth.admin.getUserById(raw.client_id),
      admin.from('milestones').select('id', { count: 'exact', head: true }).eq('project_id', raw.id),
      admin
        .from('milestones')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', raw.id)
        .eq('status', 'done'),
      admin.from('files').select('id', { count: 'exact', head: true }).eq('project_id', raw.id).eq('kind', 'deliverable'),
    ]);

  const client_name = (profile as { full_name: string | null } | null)?.full_name ?? null;
  const client_email = userData?.user?.email ?? '';

  return {
    id: raw.id,
    client_id: raw.client_id,
    client_name,
    client_email,
    name: raw.name,
    description: raw.description,
    status: raw.status,
    started_at: raw.started_at,
    due_at: raw.due_at,
    archived_at: raw.archived_at,
    archive_key: raw.archive_key,
    milestone_total: milestone_total ?? 0,
    milestone_done: milestone_done ?? 0,
    file_count: file_count ?? 0,
  };
}

export async function listProjects(opts: { archived?: boolean } = {}): Promise<ProjectRow[]> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from('projects')
    .select('id, client_id, name, description, status, started_at, due_at, archived_at, archive_key')
    .order('created_at', { ascending: false });

  if (opts.archived === true) query = query.not('archived_at', 'is', null);
  else if (opts.archived === false) query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) throw new Error(`projects query failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string;
    client_id: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    started_at: string;
    due_at: string | null;
    archived_at: string | null;
    archive_key: string | null;
  }>;

  const out: ProjectRow[] = [];
  for (const r of rows) {
    out.push(await hydrateProjectRow(r));
  }
  return out;
}

export async function getProjectDetail(
  projectId: string
): Promise<{ ok: true; project: ProjectRow; milestones: MilestoneRow[]; files: FileRow[] } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();
  const { data: raw, error } = await admin
    .from('projects')
    .select('id, client_id, name, description, status, started_at, due_at, archived_at, archive_key')
    .eq('id', projectId)
    .maybeSingle();

  if (error) return { ok: false, error: `Project load failed: ${error.message}` };
  if (!raw) return { ok: false, error: 'Project not found.' };

  const project = await hydrateProjectRow(
    raw as {
      id: string;
      client_id: string;
      name: string;
      description: string | null;
      status: ProjectStatus;
      started_at: string;
      due_at: string | null;
      archived_at: string | null;
      archive_key: string | null;
    }
  );

  const { data: milestoneData, error: msError } = await admin
    .from('milestones')
    .select('id, project_id, title, amount_cents, currency, position, status')
    .eq('project_id', projectId)
    .order('position', { ascending: true });

  if (msError) return { ok: false, error: `Milestones load failed: ${msError.message}` };

  const { data: fileData, error: fileError } = await admin
    .from('files')
    .select('id, bucket, r2_key, kind, ticket_id, project_id, filename, mime, size_bytes, created_at, uploaded_by')
    .eq('project_id', projectId)
    .eq('kind', 'deliverable')
    .order('created_at', { ascending: true });

  if (fileError) return { ok: false, error: `Files load failed: ${fileError.message}` };

  return {
    ok: true,
    project,
    milestones: (milestoneData ?? []) as MilestoneRow[],
    files: (fileData ?? []) as FileRow[],
  };
}

export async function createProject(input: {
  client_id: string;
  name: string;
  description?: string;
  due_at?: string;
}): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  const trimmed = input.name.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    return { ok: false, error: 'Project name must be between 1 and 200 characters.' };
  }

  const due_at = input.due_at?.trim() ? input.due_at.trim() : null;
  if (due_at && !isValidDueDate(due_at)) {
    return { ok: false, error: 'Invalid due date. Use YYYY-MM-DD.' };
  }

  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', input.client_id)
    .maybeSingle();

  if (profileError) return { ok: false, error: `Client lookup failed: ${profileError.message}` };
  if (!profile || profile.role !== 'client' || profile.is_active !== true) {
    return { ok: false, error: 'Client not found or inactive.' };
  }

  const description = input.description?.trim() ? input.description.trim() : null;

  const { data, error } = await admin
    .from('projects')
    .insert({
      client_id: input.client_id,
      name: trimmed,
      description,
      due_at,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: `Could not create project: ${error?.message ?? 'no row'}` };
  return { ok: true, projectId: data.id };
}

export async function updateProject(
  projectId: string,
  patch: { name?: string; description?: string | null; status?: ProjectStatus; due_at?: string | null }
): Promise<CrmResult> {
  const updates: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (trimmed.length < 1 || trimmed.length > 200) return crmError('Project name must be between 1 and 200 characters.');
    updates.name = trimmed;
  }

  if (patch.description !== undefined) {
    if (patch.description === null) updates.description = null;
    else {
      const t = patch.description.trim();
      updates.description = t.length === 0 ? null : t;
    }
  }

  if (patch.status !== undefined) {
    if (!isProjectStatus(patch.status)) return crmError('Invalid project status.');
    updates.status = patch.status;
  }

  if (patch.due_at !== undefined) {
    if (patch.due_at === null || patch.due_at.trim() === '') updates.due_at = null;
    else {
      const v = patch.due_at.trim();
      if (!isValidDueDate(v)) return crmError('Invalid due date. Use YYYY-MM-DD.');
      updates.due_at = v;
    }
  }

  if (Object.keys(updates).length === 0) return crmError('No changes provided.');

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('projects').update(updates).eq('id', projectId);
  if (error) return crmError(`Update failed: ${error.message}`);
  return { ok: true };
}

export async function addMilestone(
  projectId: string,
  input: { title: string; amount_cents?: number; currency?: string }
): Promise<CrmResult> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 200) return crmError('Title must be between 1 and 200 characters.');
  if (input.amount_cents !== undefined) {
    if (!Number.isInteger(input.amount_cents) || input.amount_cents < 0) return crmError('Amount must be a non-negative integer (cents).');
  }
  const currency = input.currency?.trim().toUpperCase() ?? 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) return crmError('Currency must be a 3-letter code.');

  const admin = getSupabaseAdmin();
  const { data: project } = await admin.from('projects').select('id').eq('id', projectId).maybeSingle();
  if (!project) return crmError('Project not found.');

  const { data: maxRows } = await admin
    .from('milestones')
    .select('position')
    .eq('project_id', projectId)
    .order('position', { ascending: false })
    .limit(1);

  const maxPos = (maxRows as Array<{ position: number }> | null)?.[0]?.position ?? -1;
  const position = maxPos + 1;

  const { error } = await admin.from('milestones').insert({
    project_id: projectId,
    title,
    amount_cents: input.amount_cents ?? 0,
    currency,
    position,
  });
  if (error) return crmError(`Could not add milestone: ${error.message}`);
  return { ok: true };
}

export async function updateMilestone(
  milestoneId: string,
  patch: { title?: string; amount_cents?: number; status?: 'pending' | 'in_progress' | 'done' }
): Promise<CrmResult> {
  const updates: Record<string, unknown> = {};

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length < 1 || t.length > 200) return crmError('Title must be between 1 and 200 characters.');
    updates.title = t;
  }

  if (patch.amount_cents !== undefined) {
    if (!Number.isInteger(patch.amount_cents) || patch.amount_cents < 0) return crmError('Amount must be a non-negative integer (cents).');
    updates.amount_cents = patch.amount_cents;
  }

  if (patch.status !== undefined) {
    if (!isMilestoneStatus(patch.status)) return crmError('Invalid milestone status.');
    updates.status = patch.status;
  }

  if (Object.keys(updates).length === 0) return crmError('No changes provided.');

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('milestones').update(updates).eq('id', milestoneId);
  if (error) return crmError(`Update failed: ${error.message}`);
  return { ok: true };
}

export async function deleteMilestone(milestoneId: string): Promise<CrmResult> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('milestones').delete().eq('id', milestoneId);
  if (error) return crmError(`Delete failed: ${error.message}`);
  return { ok: true };
}

export async function moveMilestone(milestoneId: string, direction: 'up' | 'down'): Promise<CrmResult> {
  const admin = getSupabaseAdmin();
  const { data: current, error: curError } = await admin
    .from('milestones')
    .select('id, project_id, position')
    .eq('id', milestoneId)
    .maybeSingle();

  if (curError) return crmError(`Lookup failed: ${curError.message}`);
  if (!current) return crmError('Milestone not found.');

  const typedCurrent = current as { id: string; project_id: string; position: number };

  const { data: siblings, error: sibError } = await admin
    .from('milestones')
    .select('id, position')
    .eq('project_id', typedCurrent.project_id)
    .order('position', { ascending: true });

  if (sibError) return crmError(`Lookup failed: ${sibError.message}`);
  const list = (siblings ?? []) as Array<{ id: string; position: number }>;
  const idx = list.findIndex((m) => m.id === milestoneId);
  if (idx === -1) return crmError('Milestone not found.');
  const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= list.length) return crmError('Cannot move further.');

  const neighbor = list[neighborIdx];
  const curPos = typedCurrent.position;
  const neighPos = neighbor.position;

  const { error: tmpErr } = await admin.from('milestones').update({ position: -1 }).eq('id', neighbor.id);
  if (tmpErr) return crmError(`Move failed: ${tmpErr.message}`);
  const { error: upd1 } = await admin.from('milestones').update({ position: neighPos }).eq('id', typedCurrent.id);
  if (upd1) {
    await admin.from('milestones').update({ position: neighPos }).eq('id', neighbor.id);
    return crmError(`Move failed: ${upd1.message}`);
  }
  const { error: upd2 } = await admin.from('milestones').update({ position: curPos }).eq('id', neighbor.id);
  if (upd2) return crmError(`Move failed: ${upd2.message}`);

  return { ok: true };
}

export async function archiveProject(
  projectId: string
): Promise<{ ok: true; archiveKey: string } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();
  const { data: project, error: projError } = await admin
    .from('projects')
    .select('id, client_id, name, description, status, started_at, due_at, archived_at, archive_key, created_at')
    .eq('id', projectId)
    .maybeSingle();

  if (projError) return { ok: false, error: `Project lookup failed: ${projError.message}` };
  if (!project) return { ok: false, error: 'Project not found.' };
  if ((project as { archived_at: string | null }).archived_at) return { ok: false, error: 'Project already archived.' };

  const { data: files, error: filesError } = await admin
    .from('files')
    .select('r2_key, filename, size_bytes')
    .eq('project_id', projectId)
    .eq('kind', 'deliverable');

  if (filesError) return { ok: false, error: `Files lookup failed: ${filesError.message}` };

  const fileRows = (files ?? []) as Array<{ r2_key: string; filename: string; size_bytes: number }>;
  const totalBytes = fileRows.reduce((sum, f) => sum + Number(f.size_bytes ?? 0), 0);
  if (totalBytes > ARCHIVE_MAX_BYTES) {
    return { ok: false, error: 'Project files exceed the 100 MB archive limit. Download large files manually first.' };
  }

  const { data: milestones, error: msError } = await admin
    .from('milestones')
    .select('id, project_id, title, amount_cents, currency, position, status, created_at')
    .eq('project_id', projectId)
    .order('position', { ascending: true });

  if (msError) return { ok: false, error: `Milestones lookup failed: ${msError.message}` };

  const archiveKey = `archive/project_${projectId}/${new Date().toISOString()}.zip`;

  try {
    const anyArchiver = archiverNS as unknown as {
      ZipArchive?: new (opts: unknown) => import('archiver').Archiver;
      default?: (format: string, opts: unknown) => import('archiver').Archiver;
    } & ((format: string, opts: unknown) => import('archiver').Archiver);
    let archive: import('archiver').Archiver;
    if (anyArchiver.ZipArchive) {
      archive = new anyArchiver.ZipArchive({ zlib: { level: 9 } });
    } else if (typeof anyArchiver.default === 'function') {
      archive = anyArchiver.default('zip', { zlib: { level: 9 } });
    } else if (typeof anyArchiver === 'function') {
      archive = (anyArchiver as unknown as (format: string, opts: unknown) => import('archiver').Archiver)('zip', {
        zlib: { level: 9 },
      });
    } else {
      throw new Error('archiver module incompatible');
    }
    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => {
      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('error', reject);
      archive.on('end', () => resolve(Buffer.concat(chunks)));
    });

    archive.append(JSON.stringify(project, null, 2), { name: 'project.json' });
    archive.append(JSON.stringify(milestones ?? [], null, 2), { name: 'milestones.json' });

    const usedNames = new Set<string>();
    for (const f of fileRows) {
      const bytes = await getPrivateObjectBytes(f.r2_key);
      let name = `files/${f.filename}`;
      let counter = 2;
      while (usedNames.has(name)) {
        const dot = f.filename.lastIndexOf('.');
        const bare = dot > 0 ? f.filename.slice(0, dot) : f.filename;
        const ext = dot > 0 ? f.filename.slice(dot) : '';
        name = `files/${bare}-${counter}${ext}`;
        counter++;
      }
      usedNames.add(name);
      archive.append(bytes, { name });
    }

    archive.finalize();
    const buffer = await finished;
    await putPrivateObject(archiveKey, buffer, 'application/zip');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Archive failed: ${msg}` };
  }

  const { error: updError } = await admin
    .from('projects')
    .update({ archived_at: new Date().toISOString(), archive_key: archiveKey })
    .eq('id', projectId);

  if (updError) return { ok: false, error: `Archive update failed: ${updError.message}` };

  return { ok: true, archiveKey };
}

export async function purgeArchivedProject(projectId: string): Promise<CrmResult> {
  const admin = getSupabaseAdmin();
  const { data: project, error: projError } = await admin
    .from('projects')
    .select('id, archived_at, archive_key')
    .eq('id', projectId)
    .maybeSingle();

  if (projError) return crmError(`Lookup failed: ${projError.message}`);
  if (!project) return crmError('Project not found.');
  if (!(project as { archived_at: string | null }).archived_at) return crmError('Project is not archived.');

  const typed = project as { id: string; archived_at: string | null; archive_key: string | null };

  const { data: files, error: filesError } = await admin
    .from('files')
    .select('r2_key')
    .eq('project_id', projectId)
    .eq('kind', 'deliverable');

  if (filesError) return crmError(`Files lookup failed: ${filesError.message}`);

  const keys: string[] = [];
  for (const f of (files ?? []) as Array<{ r2_key: string }>) {
    if (f.r2_key) keys.push(f.r2_key);
  }
  if (typed.archive_key) keys.push(typed.archive_key);

  if (keys.length > 0) {
    try {
      await deletePrivateObjects(keys);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return crmError(`Storage delete failed: ${msg}`);
    }
  }

  const { error: delError } = await admin.from('projects').delete().eq('id', projectId);
  if (delError) return crmError(`Delete failed: ${delError.message}`);

  return { ok: true };
}

export async function listArchivedProjects(): Promise<
  Array<Pick<ProjectRow, 'id' | 'name' | 'client_name' | 'archived_at'>>
> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('projects')
    .select('id, name, archived_at, client_id')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throw new Error(`archived projects query failed: ${error.message}`);

  const out: Array<Pick<ProjectRow, 'id' | 'name' | 'client_name' | 'archived_at'>> = [];
  for (const row of (data ?? []) as Array<{ id: string; name: string; archived_at: string; client_id: string }>) {
    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', row.client_id).maybeSingle();
    const client_name = (profile as { full_name: string | null } | null)?.full_name ?? null;
    out.push({ id: row.id, name: row.name, client_name, archived_at: row.archived_at });
  }
  return out;
}

export async function getArchiveDownloadUrl(
  projectId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();
  const { data: project, error } = await admin
    .from('projects')
    .select('id, archived_at, archive_key')
    .eq('id', projectId)
    .maybeSingle();

  if (error) return { ok: false, error: `Lookup failed: ${error.message}` };
  if (!project) return { ok: false, error: 'Project not found.' };
  const typed = project as { archived_at: string | null; archive_key: string | null };
  if (!typed.archived_at || !typed.archive_key) return { ok: false, error: 'Project is not archived.' };

  try {
    const url = await presignPrivateGet(typed.archive_key, 60);
    return { ok: true, url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function listOwnProjects(clientId: string): Promise<PortalProjectRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('projects')
    .select('id, name, status, due_at')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`own projects query failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ id: string; name: string; status: ProjectStatus; due_at: string | null }>;
  const out: PortalProjectRow[] = [];
  for (const r of rows) {
    const { count: total } = await admin
      .from('milestones')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', r.id);
    const { count: done } = await admin
      .from('milestones')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', r.id)
      .eq('status', 'done');
    out.push({
      id: r.id,
      name: r.name,
      status: r.status,
      due_at: r.due_at,
      milestone_total: total ?? 0,
      milestone_done: done ?? 0,
    });
  }
  return out;
}

export async function countOwnActiveProjects(clientId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { count, error } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'active')
    .is('archived_at', null);

  if (error) throw new Error(`count active projects failed: ${error.message}`);
  return count ?? 0;
}
