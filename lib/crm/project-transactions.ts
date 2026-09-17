import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { CrmResult } from '@/lib/crm/result';
import type { ProjectRow, MilestoneRow } from '@/lib/crm/projects';
import type { FileRow } from '@/lib/crm/files';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function title(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200; }
function amount(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2147483647; }
function page(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 1000000 ? value : 1; }

// Trusted-server service: public actions must still require a current administrator.
async function mutate(operation: string, project: string | null, milestone: string | null, payload: Record<string, unknown>): Promise<CrmResult> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc('mutate_project_milestone', { p_operation: operation, p_project: project, p_milestone: milestone, p_payload: payload });
    if (error || !id(data)) return { ok: false, error: 'Milestone change refused. Refresh and check the project state before retrying.' };
    return { ok: true };
  } catch { return { ok: false, error: 'Milestone change unavailable. Refresh before retrying.' }; }
}
export async function addMilestone(project: string, input: { title: string; amount_cents?: number; currency?: string }): Promise<CrmResult> {
  if (!id(project) || !record(input) || !title(input.title) || (input.amount_cents !== undefined && !amount(input.amount_cents)) || (input.currency !== undefined && (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase())))) return { ok: false, error: 'Invalid milestone fields.' };
  return mutate('add', project, null, { title: input.title.trim(), amount_cents: input.amount_cents ?? 0, currency: input.currency?.trim().toUpperCase() ?? 'USD' });
}
export async function updateMilestone(milestone: string, patch: { title?: string; amount_cents?: number; status?: 'pending' | 'in_progress' | 'done' }): Promise<CrmResult> {
  if (!id(milestone) || !record(patch) || Object.keys(patch).some(k => !['title', 'amount_cents', 'status'].includes(k))) return { ok: false, error: 'Invalid milestone fields.' };
  const payload: Record<string, unknown> = {};
  if (patch.title !== undefined) { if (!title(patch.title)) return { ok: false, error: 'Invalid milestone title.' }; payload.title = patch.title.trim(); }
  if (patch.amount_cents !== undefined) { if (!amount(patch.amount_cents)) return { ok: false, error: 'Invalid milestone amount.' }; payload.amount_cents = patch.amount_cents; }
  if (patch.status !== undefined) { if (!['pending', 'in_progress', 'done'].includes(patch.status)) return { ok: false, error: 'Invalid milestone status.' }; payload.status = patch.status; }
  if (!Object.keys(payload).length) return { ok: false, error: 'No changes provided.' };
  return mutate('update', null, milestone, payload);
}
export async function deleteMilestone(milestone: string): Promise<CrmResult> {
  return id(milestone) ? mutate('delete', null, milestone, {}) : { ok: false, error: 'Invalid milestone.' };
}
export async function moveMilestone(milestone: string, direction: 'up' | 'down'): Promise<CrmResult> {
  return id(milestone) && (direction === 'up' || direction === 'down') ? mutate('move', null, milestone, { direction }) : { ok: false, error: 'Invalid milestone move.' };
}
export interface ProjectDetail { project: ProjectRow; milestones: MilestoneRow[]; files: FileRow[]; milestonePage: number; filePage: number; pageSize: number }
export async function getProjectDetail(project: string, options: { milestonePage?: number; filePage?: number } = {}): Promise<({ ok: true } & ProjectDetail) | { ok: false; error: string }> {
  if (!id(project)) return { ok: false, error: 'Project not found.' };
  try {
    const { data, error } = await getSupabaseAdmin().rpc('project_detail_page', { p_project: project, p_milestones: page(options?.milestonePage), p_files: page(options?.filePage) });
    if (error) return { ok: false, error: 'Project load failed.' };
    if (!data) return { ok: false, error: 'Project not found.' };
    if (!record(data) || !record(data.project) || data.project.id !== project || !Array.isArray(data.milestones) || !Array.isArray(data.files) || data.pageSize !== 25 || data.milestones.length > 25 || data.files.length > 25 || !Number.isSafeInteger(data.milestonePage) || !Number.isSafeInteger(data.filePage)) return { ok: false, error: 'Project load failed.' };
    return { ok: true, ...(data as unknown as ProjectDetail) };
  } catch { return { ok: false, error: 'Project load failed.' }; }
}
