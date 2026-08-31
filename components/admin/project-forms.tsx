'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  addMilestoneAction,
  archiveDownloadUrlAction,
  archiveProjectAction,
  confirmDeliverableAction,
  createProjectAction,
  deleteFileAction,
  deleteMilestoneAction,
  getDeliverablePresignAction,
  moveMilestoneAction,
  purgeArchivedProjectAction,
  setMilestoneStatusAction,
  updateProjectAction,
} from '@/lib/crm/admin-actions';

// ── helpers ────────────────────────────────────────────────────────────────

function formatCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// ── New project dialog ───────────────────────────────────────────────────

export function NewProjectDialog({
  clients,
}: {
  clients: Array<{ id: string; email: string; full_name: string | null; company?: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  function onCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const state = await createProjectAction({}, formData);
      if (state.error) {
        setError(state.error);
        return;
      }
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">New project</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Create a project for a client.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={onCreate} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-project-client">Client</Label>
            <select
              id="new-project-client"
              name="client_id"
              required
              defaultValue=""
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="" disabled>
                Select a client
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name ? `${c.full_name} · ${c.email}` : c.email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-project-name">Name</Label>
            <Input id="new-project-name" name="name" required maxLength={200} placeholder="Project name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-project-description">Description</Label>
            <Textarea
              id="new-project-description"
              name="description"
              rows={3}
              placeholder="Optional description"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-project-due">Due date</Label>
            <Input id="new-project-due" name="due_at" type="date" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit project form (inline card) ─────────────────────────────────────

export function EditProjectForm({
  project,
}: {
  project: { id: string; name: string; description: string | null; status: string; due_at: string | null };
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const state = await updateProjectAction(project.id, {}, formData);
      if (state.error) {
        setError(state.error);
        return;
      }
      setNotice('Saved.');
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="edit-name">Name</Label>
        <Input id="edit-name" name="name" defaultValue={project.name} required maxLength={200} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-description">Description</Label>
        <Textarea id="edit-description" name="description" defaultValue={project.description ?? ''} rows={3} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-status">Status</Label>
          <select
            id="edit-status"
            name="status"
            defaultValue={project.status}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="done">done</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-due">Due date</Label>
          <Input id="edit-due" name="due_at" type="date" defaultValue={project.due_at ?? ''} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}

// ── Add milestone form ───────────────────────────────────────────────────

export function AddMilestoneForm({ projectId }: { projectId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const state = await addMilestoneAction(projectId, {}, formData);
      if (state.error) {
        setError(state.error);
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="flex flex-wrap items-end gap-2 border-t pt-4">
      <div className="min-w-[180px] flex-1 space-y-1.5">
        <Label htmlFor="ms-title">Title</Label>
        <Input id="ms-title" name="title" required maxLength={200} placeholder="Milestone title" />
      </div>
      <div className="w-28 space-y-1.5">
        <Label htmlFor="ms-amount">Amount ($)</Label>
        <Input id="ms-amount" name="amount" type="number" step="0.01" min="0" placeholder="0.00" />
      </div>
      <div className="w-20 space-y-1.5">
        <Label htmlFor="ms-currency">Currency</Label>
        <Input id="ms-currency" name="currency" defaultValue="USD" maxLength={3} placeholder="USD" />
      </div>
      <Button type="submit" size="sm" disabled={pending} className="shrink-0">
        {pending ? 'Adding…' : 'Add'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

// ── Milestone row (status select, move, delete) ─────────────────────────

export function MilestoneRow({
  milestone,
  isFirst,
  isLast,
}: {
  milestone: { id: string; title: string; amount_cents: number; currency: string; status: string };
  isFirst: boolean;
  isLast: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onStatusChange(value: string) {
    setError(null);
    startTransition(async () => {
      const state = await setMilestoneStatusAction(milestone.id, value);
      if (state.error) setError(state.error);
      else router.refresh();
    });
  }

  function onMove(direction: 'up' | 'down') {
    setError(null);
    startTransition(async () => {
      const state = await moveMilestoneAction(milestone.id, direction);
      if (state.error) setError(state.error);
      else router.refresh();
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const state = await deleteMilestoneAction(milestone.id);
      if (state.error) setError(state.error);
      else router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 font-medium">{milestone.title}</span>
      <span className="text-muted-foreground">{formatCents(milestone.amount_cents, milestone.currency)}</span>
      <select
        aria-label="Milestone status"
        defaultValue={milestone.status}
        onChange={(e) => onStatusChange(e.target.value)}
        disabled={pending}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        <option value="pending">pending</option>
        <option value="in_progress">in_progress</option>
        <option value="done">done</option>
      </select>
      <span className="inline-flex gap-1">
        <Button size="sm" variant="outline" disabled={pending || isFirst} onClick={() => onMove('up')} aria-label="Move up">
          ↑
        </Button>
        <Button size="sm" variant="outline" disabled={pending || isLast} onClick={() => onMove('down')} aria-label="Move down">
          ↓
        </Button>
      </span>
      <Button size="sm" variant="ghost" disabled={pending} onClick={onDelete}>
        Delete
      </Button>
      {error && <span className="w-full text-xs text-destructive">{error}</span>}
    </li>
  );
}

// ── Deliverable upload ───────────────────────────────────────────────────

export function DeliverableUpload({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    // reset so re-selecting same file fires change
    if (inputRef.current) inputRef.current.value = '';
    if (files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of files) {
        setProgress(`Uploading ${file.name}…`);
        const presign = await getDeliverablePresignAction(projectId, file.name, file.type || 'application/octet-stream', file.size);
        if (!presign.ok) throw new Error(presign.error);
        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (!putRes.ok) throw new Error(`Upload failed for ${file.name}`);
        const confirm = await confirmDeliverableAction(projectId, {
          key: presign.key,
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          size_bytes: file.size,
        });
        if (confirm.error) throw new Error(confirm.error);
      }
      setProgress(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="deliverable-files">Upload deliverables</Label>
      <Input
        ref={inputRef}
        id="deliverable-files"
        type="file"
        multiple
        onChange={onFilesSelected}
        disabled={busy}
        accept=".pdf,.docx,.doc,.xlsx,.png,.jpg,.zip"
      />
      {busy && <p className="text-xs text-muted-foreground">{progress ?? 'Uploading…'}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Accepted: pdf, docx, doc, xlsx, png, jpg, zip · up to 10 MB each.</p>
    </div>
  );
}

// ── Deliverable file row helpers ────────────────────────────────────────

export function DeliverableDownloadLink({ fileId }: { fileId: string }) {
  return (
    <Button size="sm" variant="outline" asChild>
      <a href={`/api/files/${fileId}/download`}>Download</a>
    </Button>
  );
}

export function DeleteFileButton({ fileId, filename }: { fileId: string; filename: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const state = await deleteFileAction(fileId);
      if (state.error) {
        setError(state.error);
        return;
      }
      setOpen(false);
      setTyped('');
      router.refresh();
    });
  }

  const canDelete = typed === filename;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTyped('');
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete file</DialogTitle>
          <DialogDescription>
            Type <span className="font-mono font-medium">{filename}</span> to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`del-delete-${fileId}`}>Confirm filename</Label>
          <Input
            id={`del-delete-${fileId}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={filename}
            autoComplete="off"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" onClick={onConfirm} disabled={pending || !canDelete}>
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Archive / purge dialog buttons ──────────────────────────────────────

export function ArchiveProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const state = await archiveProjectAction(projectId);
      if (state.error) {
        setError(state.error);
        return;
      }
      setOpen(false);
      router.push('/admin/projects');
      router.refresh();
    });
  }

  const canArchive = typed === projectName;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTyped('');
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          Archive project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Archive project</DialogTitle>
          <DialogDescription>
            This will create a ZIP backup and hide the project. Type{' '}
            <span className="font-mono font-medium">{projectName}</span> to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="archive-confirm">Project name</Label>
          <Input
            id="archive-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={projectName}
            autoComplete="off"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" onClick={onConfirm} disabled={pending || !canArchive}>
            {pending ? 'Archiving…' : 'Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveDownloadButton({ projectId }: { projectId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDownload() {
    setError(null);
    startTransition(async () => {
      const res = await archiveDownloadUrlAction(projectId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.assign(res.url);
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" variant="outline" onClick={onDownload} disabled={pending}>
        {pending ? 'Preparing…' : 'Download backup'}
      </Button>
    </span>
  );
}

export function PurgeProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const state = await purgeArchivedProjectAction(projectId);
      if (state.error) {
        setError(state.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const canDelete = typed === projectName;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTyped('');
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          Delete forever
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete forever</DialogTitle>
          <DialogDescription>
            This will permanently delete the project, its milestones, files, and backup ZIP. Type{' '}
            <span className="font-mono font-medium">{projectName}</span> to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`purge-${projectId}`}>Project name</Label>
          <Input
            id={`purge-${projectId}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={projectName}
            autoComplete="off"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" onClick={onConfirm} disabled={pending || !canDelete}>
            {pending ? 'Deleting…' : 'Delete forever'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Archived list row inline actions (download + purge) - used on list page
export function ArchivedProjectActions({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <ArchiveDownloadButton projectId={projectId} />
      <PurgeProjectButton projectId={projectId} projectName={projectName} />
    </span>
  );
}

// Helper for file size in file list (exposed for detail page if needed)
export function FileSize({ bytes }: { bytes: number }) {
  return <span>{formatBytes(bytes)}</span>;
}
