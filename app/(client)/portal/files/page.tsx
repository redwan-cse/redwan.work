import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { getCurrentSession } from '@/lib/auth/session';
import { listOwnProjects } from '@/lib/crm/projects';
import { listOwnDeliverables } from '@/lib/crm/files';

export const dynamic = 'force-dynamic';

const PROJECT_BADGE: Record<string, string> = {
  active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDue(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatUploaded(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function PortalFilesPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/files');

  const [projects, deliverables] = await Promise.all([
    listOwnProjects(session.userId),
    listOwnDeliverables(session.userId),
  ]);

  // Group deliverables by project_id for O(1) lookup per project
  const byProject = new Map<string, typeof deliverables>();
  for (const f of deliverables) {
    const key = f.project_id ?? '';
    const arr = byProject.get(key);
    if (arr) arr.push(f);
    else byProject.set(key, [f]);
  }

  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Files</h1>
        <p className="text-sm text-muted-foreground">No deliverables yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Files</h1>

      {projects.map((project) => {
        const files = byProject.get(project.id) ?? [];
        return (
          <section key={project.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold">{project.name}</h2>
              <Badge variant="outline" className={PROJECT_BADGE[project.status] ?? ''}>
                {project.status}
              </Badge>
              <span className="text-xs text-muted-foreground">Due {formatDue(project.due_at)}</span>
            </div>

            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files yet.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">File</th>
                      <th className="px-4 py-2 font-medium">Size</th>
                      <th className="px-4 py-2 font-medium">Uploaded</th>
                      <th className="px-4 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.id} className="border-t">
                        <td className="px-4 py-2 font-medium">{file.filename}</td>
                        <td className="px-4 py-2 text-muted-foreground">{formatBytes(file.size_bytes)}</td>
                        <td className="px-4 py-2 text-muted-foreground">{formatUploaded(file.created_at)}</td>
                        <td className="px-4 py-2 text-right">
                          <a
                            href={`/api/files/${file.id}/download`}
                            className="inline-flex h-7 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-accent"
                          >
                            Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {/* If all projects have files, deliverables length >0; if projects exist but zero deliverables across all,
          the per-project "No files yet." already communicates state. However spec also says Files page empty
          state "No deliverables yet." — that case is handled when projects.length===0. If projects exist
          but no files at all, we have already rendered per-project muted lines rather than a single empty
          paragraph, which satisfies "projects with zero deliverables still listed". */}
    </div>
  );
}
