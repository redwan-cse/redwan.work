import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getProjectDetail } from '@/lib/crm/projects';
import {
  AddMilestoneForm,
  ArchiveDownloadButton,
  ArchiveProjectButton,
  DeleteFileButton,
  DeliverableDownloadLink,
  DeliverableUpload,
  EditProjectForm,
  MilestoneRow,
  PurgeProjectButton,
} from '@/components/admin/project-forms';
import { formatBytes } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PROJECT_BADGE: Record<string, string> = {
  active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatUploaded(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

export default async function AdminProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getProjectDetail(id);
  if (!result.ok || !('project' in result)) notFound();
  const { project, milestones, files } = result;
  const isArchived = !!project.archived_at;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/projects" className="text-sm text-muted-foreground hover:underline">
          ← All projects
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <Badge variant="outline" className={PROJECT_BADGE[project.status] ?? ''}>
              {project.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.client_name ?? 'Client'} · {project.client_email}
          </p>
          {project.due_at && <p className="text-xs text-muted-foreground">Due {formatDate(project.due_at)}</p>}
          {isArchived && <p className="text-xs text-amber-600">Archived {formatDate(project.archived_at)}</p>}
        </div>
      </header>

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit project</CardTitle>
        </CardHeader>
        <CardContent>
          <EditProjectForm
            project={{
              id: project.id,
              name: project.name,
              description: project.description,
              status: project.status,
              due_at: project.due_at,
            }}
          />
        </CardContent>
      </Card>

      {/* Milestones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Milestones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No milestones yet.</p>
          ) : (
            <ul className="space-y-2">
              {milestones.map((m, idx) => (
                <MilestoneRow
                  key={m.id}
                  milestone={{
                    id: m.id,
                    title: m.title,
                    amount_cents: m.amount_cents,
                    currency: m.currency,
                    status: m.status,
                  }}
                  isFirst={idx === 0}
                  isLast={idx === milestones.length - 1}
                />
              ))}
            </ul>
          )}
          {!isArchived && <AddMilestoneForm projectId={project.id} />}
          {isArchived && <p className="text-xs text-muted-foreground">Archived projects cannot add milestones.</p>}
        </CardContent>
      </Card>

      {/* Deliverables */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deliverables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isArchived && <DeliverableUpload projectId={project.id} />}
          {isArchived && <p className="text-xs text-muted-foreground">Archived project — uploads disabled.</p>}
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deliverables yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Filename</th>
                    <th className="px-4 py-2 font-medium">Size</th>
                    <th className="px-4 py-2 font-medium">Uploaded</th>
                    <th className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="px-4 py-2 font-medium">{f.filename}</td>
                      <td className="px-4 py-2 text-muted-foreground">{formatBytes(f.size_bytes)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{formatUploaded(f.created_at)} UTC</td>
                      <td className="px-4 py-2 text-right">
                        <span className="inline-flex items-center gap-2">
                          <DeliverableDownloadLink fileId={f.id} />
                          <DeleteFileButton fileId={f.id} filename={f.filename} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className={isArchived ? 'border-amber-200' : 'border-destructive/50'}>
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          {!isArchived ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Archive project</p>
                <p className="text-xs text-muted-foreground">
                  Creates a ZIP backup and hides the project. You have 30 days to download the backup.
                </p>
              </div>
              <ArchiveProjectButton projectId={project.id} projectName={project.name} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Archived</p>
                <p className="text-xs text-muted-foreground">
                  Download the backup before it is purged 30 days after archiving.
                </p>
              </div>
              <span className="inline-flex items-center gap-2">
                <ArchiveDownloadButton projectId={project.id} />
                <PurgeProjectButton projectId={project.id} projectName={project.name} />
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
