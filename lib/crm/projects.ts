import 'server-only';

import { archiveProject as verifiedArchive } from '@/lib/crm/verified-archive';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { crmError, type CrmResult } from '@/lib/crm/result';
import { presignPrivateGet } from '@/lib/r2';
export { getProjectDetail, addMilestone, updateMilestone, deleteMilestone, moveMilestone } from '@/lib/crm/project-transactions';

export type ProjectStatus = 'active' | 'paused' | 'done';
export interface ProjectRow {
  id: string; client_id: string; client_name: string | null; client_email: string;
  name: string; description: string | null; status: ProjectStatus; started_at: string;
  due_at: string | null; archived_at: string | null; archive_key: string | null;
  milestone_total: number; milestone_done: number; file_count: number;
}
export interface MilestoneRow {
  id: string; project_id: string; title: string; amount_cents: number;
  currency: string; position: number; status: 'pending' | 'in_progress' | 'done';
}
export interface PortalProjectRow {
  id: string; name: string; status: ProjectStatus; due_at: string | null;
  milestone_total: number; milestone_done: number;
}
type RawProject = Omit<ProjectRow, 'client_name' | 'client_email' | 'milestone_total' | 'milestone_done' | 'file_count'>;
const PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'done'];
const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isProjectStatus(v: unknown): v is ProjectStatus { return typeof v === 'string' && PROJECT_STATUSES.includes(v as ProjectStatus); }
function isValidDueDate(v: string): boolean {
  if (!DUE_RE.test(v)) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export {listProjects,listArchivedProjects,listOwnProjects} from '@/lib/crm/compatibility-readers';
export async function createProject(input: { client_id: string; name: string; description?: string; due_at?: string }): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  if (!input || typeof input.name !== 'string' || typeof input.client_id !== 'string' || (input.description !== undefined && typeof input.description !== 'string') || (input.due_at !== undefined && typeof input.due_at !== 'string')) return { ok: false, error: 'Invalid project fields.' };
  const trimmed = input.name.trim();
  if (trimmed.length < 1 || trimmed.length > 200) return { ok: false, error: 'Project name must be between 1 and 200 characters.' };
  const due_at = input.due_at?.trim() || null;
  if (due_at && !isValidDueDate(due_at)) return { ok: false, error: 'Invalid due date. Use YYYY-MM-DD.' };
  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin.from('profiles').select('id, role, is_active').eq('id', input.client_id).maybeSingle();
  if (profileError) return { ok: false, error: 'Client lookup failed.' };
  if (!profile || profile.role !== 'client' || profile.is_active !== true) return { ok: false, error: 'Client not found or inactive.' };
  const { data, error } = await admin.from('projects').insert({ client_id: input.client_id, name: trimmed, description: input.description?.trim() || null, due_at }).select('id').single();
  if (error || !data) return { ok: false, error: 'Could not create project.' };
  return { ok: true, projectId: data.id };
}
export async function updateProject(projectId: string, patch: { name?: string; description?: string | null; status?: ProjectStatus; due_at?: string | null }): Promise<CrmResult> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return crmError('Invalid project fields.');
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string') return crmError('Invalid project name.');
    const trimmed = patch.name.trim();
    if (trimmed.length < 1 || trimmed.length > 200) return crmError('Project name must be between 1 and 200 characters.');
    updates.name = trimmed;
  }
  if (patch.description !== undefined) {
    if (patch.description !== null && typeof patch.description !== 'string') return crmError('Invalid description.');
    updates.description = patch.description?.trim() || null;
  }
  if (patch.status !== undefined) {
    if (!isProjectStatus(patch.status)) return crmError('Invalid project status.');
    updates.status = patch.status;
  }
  if (patch.due_at !== undefined) {
    if (patch.due_at !== null && typeof patch.due_at !== 'string') return crmError('Invalid due date.');
    const due = patch.due_at?.trim() || null;
    if (due && !isValidDueDate(due)) return crmError('Invalid due date. Use YYYY-MM-DD.');
    updates.due_at = due;
  }
  if (Object.keys(updates).length === 0) return crmError('No changes provided.');
  const { data, error } = await getSupabaseAdmin().from('projects').update(updates).eq('id', projectId).is('archived_at', null).select('id').maybeSingle();
  if (error || !data) return crmError('Update refused. The project may be missing or archived.');
  return { ok: true };
}
export async function archiveProject(projectId: string): Promise<{ ok: true; archiveKey: string } | { ok: false; error: string }> { return verifiedArchive(projectId); }
export async function purgeArchivedProject(projectId: string): Promise<CrmResult> {
  const { purgeArchivedProject: prepareRecovery } = await import('@/lib/crm/retention');
  return prepareRecovery(projectId);
}
export async function getArchiveDownloadUrl(projectId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data: project, error } = await getSupabaseAdmin().from('projects').select('id, archived_at, archive_key').eq('id', projectId).maybeSingle();
  if (error) return { ok: false, error: 'Lookup failed.' };
  if (!project) return { ok: false, error: 'Project not found.' };
  if (!project.archived_at || !project.archive_key) return { ok: false, error: 'Project is not archived.' };
  try { return { ok: true, url: await presignPrivateGet(project.archive_key, 60) }; }
  catch { return { ok: false, error: 'Archive download unavailable.' }; }
}
export async function countOwnActiveProjects(clientId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from('projects').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'active').is('archived_at', null);
  if (error || count === null) throw new Error('count active projects failed.');
  return count;
}
