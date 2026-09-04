'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteAssetAction, uploadAssetAction } from '@/lib/crm/admin-actions';
import { formatBytes } from '@/lib/format';

type UploadedAsset = { key: string; url: string };

export function AssetUploader({ accept, maxBytes }: { accept: string; maxBytes: number }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<UploadedAsset[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    // reset so re-selecting the same file fires change again
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    setError(null);
    setNotice(null);
    setCopied(null);
    if (file.size < 1) {
      setError('Choose a file to upload.');
      return;
    }
    if (file.size > maxBytes) {
      setError(`File is too large. Maximum size is ${formatBytes(maxBytes)}.`);
      return;
    }
    setBusy(true);
    setProgress(`Uploading ${file.name}…`);
    const formData = new FormData();
    formData.append('file', file);
    startTransition(async () => {
      try {
        const state = await uploadAssetAction({}, formData);
        if (state.error || !state.url || !state.key) {
          setError(state.error ?? 'Upload failed. Please try again.');
          return;
        }
        setItems((prev) => [{ key: state.key as string, url: state.url as string }, ...prev]);
        setNotice(state.notice ?? 'Asset uploaded.');
      } catch {
        setError('Upload failed. Please try again.');
      } finally {
        setBusy(false);
        setProgress(null);
      }
    });
  }

  function onDelete(key: string) {
    if (deletingKey) return;
    setError(null);
    setNotice(null);
    setDeletingKey(key);
    startTransition(async () => {
      try {
        const state = await deleteAssetAction(key);
        if (state.error) {
          setError(state.error);
          return;
        }
        setItems((prev) => prev.filter((it) => it.key !== key));
        setNotice('Asset deleted.');
      } catch {
        setError('Delete failed. Please try again.');
      } finally {
        setDeletingKey(null);
      }
    });
  }

  async function onCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
    } catch {
      setError('Copy failed. Select the URL manually.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="asset-file">Upload asset</Label>
        <Input
          ref={inputRef}
          id="asset-file"
          type="file"
          accept={accept}
          onChange={onFileSelected}
          disabled={busy}
        />
        {busy && <p className="text-xs text-muted-foreground">{progress ?? 'Uploading…'}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && !error && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
        <p className="text-xs text-muted-foreground">
          Accepted: {accept.replaceAll('.', '').replaceAll(',', ', ')} · up to {formatBytes(maxBytes)} each.
        </p>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.key} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
              <div className="min-w-0 flex-1">
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium underline underline-offset-4"
                >
                  {it.url}
                </a>
                <p className="truncate text-xs text-muted-foreground">{it.key}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onCopy(it.url)}>
                {copied === it.url ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy || deletingKey === it.key} onClick={() => onDelete(it.key)}>
                {deletingKey === it.key ? 'Deleting…' : 'Delete'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
