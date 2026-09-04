'use client';

import { useRef, useState, useTransition } from 'react';
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
import { Plus, X } from 'lucide-react';
import { createTicketWithAttachmentsAction } from '@/lib/crm/client-actions';
import { formatBytes } from '@/lib/format';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_EXTS = ['pdf', 'docx', 'doc', 'xlsx', 'png', 'jpg', 'zip'];
const ATTACHMENT_ACCEPT_ATTR = '.pdf,.docx,.doc,.xlsx,.png,.jpg,.zip';
const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  zip: 'application/zip',
};

interface AttachedFile {
  key: string;
  filename: string;
  mime: string;
  size_bytes: number;
}

function attachmentExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function attachmentMime(filename: string, browserType?: string): string {
  return EXT_TO_MIME[attachmentExtension(filename)] ?? browserType ?? 'application/octet-stream';
}

export function NewTicketButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    if (inputRef.current) inputRef.current.value = '';
    if (selected.length === 0) return;
    setUploadError(null);

    if (attachedFiles.length + selected.length > MAX_ATTACHMENTS) {
      setUploadError(`You can attach up to ${MAX_ATTACHMENTS} files in total.`);
      return;
    }
    for (const file of selected) {
      if (!ACCEPTED_ATTACHMENT_EXTS.includes(attachmentExtension(file.name))) {
        setUploadError(
          `"${file.name}" has an unsupported file type. Accepted: ${ACCEPTED_ATTACHMENT_EXTS.map((ext) => `.${ext}`).join(', ')}`
        );
        return;
      }
      if (file.size < 1 || file.size > MAX_ATTACHMENT_BYTES) {
        setUploadError(`"${file.name}" is too large. Each file can be up to ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
        return;
      }
    }

    setUploading(true);
    try {
      const presignResponse = await fetch('/api/uploads/ticket-presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: null,
          files: selected.map((file) => ({
            filename: file.name,
            mime: attachmentMime(file.name, file.type),
            size: file.size,
          })),
        }),
      });
      const presignData = await presignResponse.json().catch(() => null);
      if (!presignResponse.ok) {
        throw new Error(presignData?.error || 'Could not prepare your files for upload. Please try again.');
      }

      const uploads: Array<{ key?: unknown; uploadUrl?: unknown; filename?: unknown }> =
        Array.isArray(presignData?.uploads) ? presignData.uploads : [];

      if (uploads.length !== selected.length) {
        throw new Error('Could not prepare your files for upload. Please try again.');
      }

      const uploaded: AttachedFile[] = [];
      for (let i = 0; i < uploads.length; i += 1) {
        const upload = uploads[i];
        if (
          typeof upload.key !== 'string' ||
          typeof upload.uploadUrl !== 'string' ||
          typeof upload.filename !== 'string'
        ) {
          throw new Error('Could not prepare your files for upload. Please try again.');
        }
        const file = selected[i];
        if (!file || file.name !== upload.filename) {
          throw new Error('Could not prepare your files for upload. Please try again.');
        }
        const mime = attachmentMime(file.name, file.type);
        const putResponse = await fetch(upload.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': mime },
        });
        if (!putResponse.ok) {
          throw new Error(`"${upload.filename}" could not be uploaded. Please try again.`);
        }
        uploaded.push({ key: upload.key, filename: upload.filename, mime, size_bytes: file.size });
      }

      setAttachedFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Your files could not be uploaded. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function removeAttachedFile(key: string) {
    setAttachedFiles((prev) => prev.filter((file) => file.key !== key));
  }

  function onCreate(formData: FormData) {
    const subject = String(formData.get('subject') ?? '');
    const body = String(formData.get('body') ?? '');
    setError(null);
    startTransition(async () => {
      const state = await createTicketWithAttachmentsAction(subject, body, attachedFiles);
      if (state.error) setError(state.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setUploadError(null);
        } else {
          // Keep metas for retry while open; clear when closed? Preserve per brief: keep for retry but dialog close resets.
          // Reset on close to avoid stale pending keys persisting across opens.
          setAttachedFiles([]);
          setUploadError(null);
          setUploading(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="size-3.5" /> New ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New support ticket</DialogTitle>
          <DialogDescription>Describe what you need help with.</DialogDescription>
        </DialogHeader>
        <form action={onCreate} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input
              id="ticket-subject"
              name="subject"
              maxLength={200}
              required
              placeholder="Brief summary"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-body">Message</Label>
            <Textarea
              id="ticket-body"
              name="body"
              rows={5}
              maxLength={10000}
              required
              placeholder="Add details…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-attachments">Attachments (optional)</Label>
            <Input
              ref={inputRef}
              id="ticket-attachments"
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT_ATTR}
              onChange={handleFilesSelected}
              disabled={uploading || pending}
            />
            {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
            {attachedFiles.length > 0 && (
              <ul className="space-y-1">
                {attachedFiles.map((file) => (
                  <li
                    key={file.key}
                    className="flex items-center justify-between rounded-md border px-2 py-1 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {file.filename} <span className="text-muted-foreground">({formatBytes(file.size_bytes)})</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => removeAttachedFile(file.key)}
                      disabled={uploading || pending}
                      aria-label={`Remove ${file.filename}`}
                    >
                      <X className="size-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Accepted: pdf, docx, doc, xlsx, png, jpg, zip · up to 10 MB each · max {MAX_ATTACHMENTS}.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending || uploading}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || uploading}>
              {pending ? 'Creating…' : 'Create ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
