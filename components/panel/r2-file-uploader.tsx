'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, UploadCloud } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function R2FileUploader({
  category,
  clientId,
  orderId,
  label = 'Attach File to Encrypted Vault (Optional)',
}: {
  category:
    | 'deliverable'
    | 'requirement_attachment'
    | 'ticket_attachment'
    | 'payment_proof'
    | 'roe_document';
  clientId?: string;
  orderId?: string | null;
  label?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [fileMeta, setFileMeta] = useState<{
    r2Key: string;
    filename: string;
    mime: string;
    sizeBytes: number;
    sha256: string;
  } | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setErrorMsg('');

    try {
      // Compute SHA-256 in browser
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const sha256 = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const presignRes = await fetch('/api/uploads/portal-presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          category,
          clientId,
        }),
      });

      if (!presignRes.ok) {
        const body = (await presignRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not presign R2 upload.');
      }

      const { key, uploadUrl } = (await presignRes.json()) as {
        key: string;
        uploadUrl: string;
      };

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (!putRes.ok) {
        throw new Error('Direct upload to Cloudflare R2 failed.');
      }

      setFileMeta({
        r2Key: key,
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        sha256,
      });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 p-3">
        <UploadCloud className="h-5 w-5 shrink-0 text-primary" />
        <Input
          type="file"
          onChange={handleFileChange}
          disabled={status === 'uploading'}
          className="h-9 min-w-[200px] flex-1 cursor-pointer text-xs"
        />
      </div>

      {status === 'uploading' && (
        <p className="inline-flex items-center gap-1.5 font-mono text-xs text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Encrypting &amp; uploading to Secure Vault...
        </p>
      )}

      {status === 'done' && fileMeta && (
        <div className="rounded-lg border border-primary/25 bg-primary/8 p-2.5 font-mono text-[11px] text-primary">
          <div className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Uploaded: {fileMeta.filename} ({(fileMeta.sizeBytes / 1024).toFixed(1)} KB)
          </div>
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
            SHA-256: {fileMeta.sha256}
          </div>
        </div>
      )}

      {status === 'error' && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}

      <input type="hidden" name="r2_key" value={fileMeta?.r2Key ?? ''} />
      <input type="hidden" name="filename" value={fileMeta?.filename ?? ''} />
      <input type="hidden" name="mime" value={fileMeta?.mime ?? ''} />
      <input type="hidden" name="size_bytes" value={fileMeta?.sizeBytes ?? 0} />
      <input type="hidden" name="sha256_checksum" value={fileMeta?.sha256 ?? ''} />
    </div>
  );
}
