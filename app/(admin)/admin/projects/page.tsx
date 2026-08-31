import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { listArchivedProjects, listProjects } from '@/lib/crm/projects';
import { listClients } from '@/lib/crm/clients';
import { ArchivedProjectActions, NewProjectDialog } from '@/components/admin/project-forms';

export const dynamic = 'force-dynamic';

const PROJECT_BADGE: Record<string, string> = {
  active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

function formatDue(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatArchived(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function deletesDate(archivedAt: string): string {
  const d = new Date(new Date(archivedAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function AdminProjectsPage() {
  const [activeProjects, archived, clients] = await Promise.all([
    listProjects({ archived: false }),
    listArchivedProjects(),
    listClients(),
  ]);
  const activeClients = clients.filter((c) => c.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <NewProjectDialog clients={activeClients} />
      </div>

      {activeProjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium">Milestones</th>
                <th className="px-4 py-2 font-medium">Files</th>
              </tr>
            </thead>
            <tbody>
              {activeProjects.map((project) => (
                <tr key={project.id} className="border-t">
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/admin/projects/${project.id}`} className="hover:underline">
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span>{project.client_name ?? '—'}</span>
                    {project.client_email && (
                      <span className="block text-xs text-muted-foreground">{project.client_email}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={PROJECT_BADGE[project.status] ?? ''}>
                      {project.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDue(project.due_at)}</td>
                  <td className="px-4 py-2">
                    {project.milestone_done}/{project.milestone_total}
                  </td>
                  <td className="px-4 py-2">{project.file_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {archived.length > 0 && (
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Archived ({archived.length})</summary>
          <div className="overflow-hidden border-t">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Archived</th>
                  <th className="px-4 py-2 font-medium">Deletes</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{row.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.client_name ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatArchived(row.archived_at ?? '')}</td>
                    <td className="px-4 py-2 text-muted-foreground">deletes {deletesDate(row.archived_at ?? '')}</td>
                    <td className="px-4 py-2 text-right">
                      <ArchivedProjectActions projectId={row.id} projectName={row.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
