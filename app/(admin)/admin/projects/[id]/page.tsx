import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getProjectDetail } from '@/lib/crm/projects';
import { AddMilestoneForm, ArchiveDownloadButton, ArchiveProjectButton, DeleteFileButton, DeliverableDownloadLink, DeliverableUpload, EditProjectForm, MilestoneRow, PurgeProjectButton } from '@/components/admin/project-forms';
import { formatBytes } from '@/lib/format';
export const dynamic = 'force-dynamic';
const PROJECT_BADGE: Record<string, string> = { active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' };
function formatDate(iso: string | null): string { return iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Not set'; }
function formatUploaded(iso: string): string { return new Date(iso).toISOString().slice(0, 16).replace('T', ' '); }
function page(value: string | string[] | undefined): number { return typeof value === 'string' && /^[1-9][0-9]{0,5}$/.test(value) ? Number(value) : 1; }
function CollectionPages({ id, kind, current, other, total }: { id: string; kind: 'milestones' | 'files'; current: number; other: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / 25));
  const href = (next: number) => `/admin/projects/${id}?${new URLSearchParams({ milestones: String(kind === 'milestones' ? next : other), files: String(kind === 'files' ? next : other) })}#${kind}`;
  return <nav aria-label={`${kind} pages`} className="flex flex-wrap items-center gap-4 text-sm"><span>{total} total, page {current} of {pages}</span>{current > 1 && <Link className="underline" href={href(current - 1)}>Previous {kind}</Link>}{current < pages && <Link className="underline" href={href(current + 1)}>Next {kind}</Link>}</nav>;
}
export default async function AdminProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await getProjectDetail(id, { milestonePage: page(query.milestones), filePage: page(query.files) });
  if (!result.ok) {
    if (result.error === 'Project not found.') notFound();
    return <div role="alert" className="space-y-3"><p>Project details could not be loaded. No changes were made.</p><Link className="underline" href={`/admin/projects/${id}`}>Retry project details</Link></div>;
  }
  const { project, milestones, files, milestonePage, filePage, pageSize } = result;
  const isArchived = !!project.archived_at;
  return <div className="min-w-0 space-y-6">
    <Link href="/admin/projects" className="text-sm text-muted-foreground hover:underline">← All projects</Link>
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-xl font-semibold">{project.name}</h1><Badge variant="outline" className={PROJECT_BADGE[project.status] ?? ''}>{project.status}</Badge></div><p className="mt-1 break-words text-sm text-muted-foreground">{project.client_name ?? 'Client'} · {project.client_email}</p>{project.due_at && <p className="text-xs text-muted-foreground">Due {formatDate(project.due_at)}</p>}{isArchived && <p className="text-xs text-amber-600">Archived {formatDate(project.archived_at)}</p>}</div><Link className="text-sm underline" href={`/admin/projects/${id}/invoices`}>Project invoices</Link></header>
    <Card><CardHeader><CardTitle className="text-base">Edit project</CardTitle></CardHeader><CardContent>{isArchived ? <p className="text-sm text-muted-foreground">Archived project details are read-only.</p> : <EditProjectForm project={{ id: project.id, name: project.name, description: project.description, status: project.status, due_at: project.due_at }} />}</CardContent></Card>
    <Card id="milestones"><CardHeader><CardTitle className="text-base">Milestones</CardTitle></CardHeader><CardContent className="space-y-4">
      {milestones.length === 0 ? <p className="text-sm text-muted-foreground">No milestones yet.</p> : <fieldset disabled={isArchived} className="min-w-0"><legend className="sr-only">Milestone actions</legend><ul className="space-y-2">{milestones.map((m, idx) => <MilestoneRow key={m.id} milestone={{ id: m.id, title: m.title, amount_cents: m.amount_cents, currency: m.currency, status: m.status }} isFirst={milestonePage === 1 && idx === 0} isLast={(milestonePage - 1) * pageSize + idx + 1 === project.milestone_total} />)}</ul></fieldset>}
      <CollectionPages id={id} kind="milestones" current={milestonePage} other={filePage} total={project.milestone_total} />
      {!isArchived ? <AddMilestoneForm projectId={project.id} /> : <p className="text-xs text-muted-foreground">Archived milestones are read-only.</p>}
    </CardContent></Card>
    <Card id="files"><CardHeader><CardTitle className="text-base">Deliverables</CardTitle></CardHeader><CardContent className="space-y-4">
      {!isArchived ? <DeliverableUpload projectId={project.id} /> : <p className="text-xs text-muted-foreground">Archived project: uploads disabled.</p>}
      {files.length === 0 ? <p className="text-sm text-muted-foreground">No deliverables yet.</p> : <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Filename</th><th className="px-4 py-2 font-medium">Size</th><th className="px-4 py-2 font-medium">Uploaded</th><th className="px-4 py-2 text-right font-medium">Actions</th></tr></thead><tbody>{files.map(f => <tr key={f.id} className="border-t"><td className="max-w-xs break-words px-4 py-2 font-medium">{f.filename}</td><td className="px-4 py-2 text-muted-foreground">{formatBytes(f.size_bytes)}</td><td className="px-4 py-2 text-muted-foreground">{formatUploaded(f.created_at)} UTC</td><td className="px-4 py-2 text-right"><span className="inline-flex items-center gap-2"><DeliverableDownloadLink fileId={f.id} />{!isArchived && <DeleteFileButton fileId={f.id} filename={f.filename} />}</span></td></tr>)}</tbody></table></div>}
      <CollectionPages id={id} kind="files" current={filePage} other={milestonePage} total={project.file_count} />
    </CardContent></Card>
    <Card className={isArchived ? 'border-amber-200' : 'border-destructive/50'}><CardHeader><CardTitle className="text-base text-destructive">Danger zone</CardTitle></CardHeader><CardContent>{!isArchived ? <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Archive project</p><p className="text-xs text-muted-foreground">Creates and verifies a complete ZIP backup before hiding the project. Recovery copies are held for the approved retention policy.</p></div><ArchiveProjectButton projectId={project.id} projectName={project.name} /></div> : <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Archived</p><p className="text-xs text-muted-foreground">Download the verified backup. Cleanup preserves recovery evidence and refuses projects with financial references.</p></div><span className="inline-flex flex-wrap items-center gap-2"><ArchiveDownloadButton projectId={project.id} /><PurgeProjectButton projectId={project.id} projectName={project.name} /></span></div>}</CardContent></Card>
  </div>;
}
