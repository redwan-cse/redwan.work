import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, Download, FolderLock, Search, ShieldCheck } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export const dynamic = 'force-dynamic';

export default async function ClientVaultFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/files');

  const params = await searchParams;
  const qFilter = (params.q ?? '').trim().toLowerCase();
  const categoryFilter = (params.category ?? '').trim();

  const admin = getSupabaseAdmin();
  const { data: files } = await admin
    .from('vault_files')
    .select(
      'id, category, filename, mime_type, size_bytes, sha256_checksum, download_count, retention_until, created_at, order:orders(id, code, title), deliverable:deliverables(id, code, version_label, title, status)'
    )
    .eq('owner_client_id', session.userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const filtered = (files ?? []).filter((f) => {
    if (categoryFilter && f.category !== categoryFilter) return false;
    if (qFilter && !`${f.filename} ${f.category} ${f.sha256_checksum ?? ''}`.toLowerCase().includes(qFilter)) {
      return false;
    }
    return true;
  });

  const usedBytes = (files ?? []).reduce((sum, f) => sum + Number(f.size_bytes || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="font-mono text-xs">
            <ShieldCheck className="mr-1 h-3.5 w-3.5 text-primary" />
            Encrypted Deliverables Vault · {(usedBytes / (1024 * 1024)).toFixed(2)} MB / 500 MB
          </Badge>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            Encrypted Deliverables &amp; File Vault
          </h1>
          <p className="text-sm text-muted-foreground">
            Download VAPT audit reports, source code archives, scope docs, and receipts via short-lived 120-second signed URLs.
          </p>
        </div>

        <form method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Search filename or SHA-256..."
              className="h-8 w-52 pl-8 text-xs"
            />
          </div>
          <select
            name="category"
            aria-label="Filter vault files by category"
            defaultValue={categoryFilter}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">All Categories</option>
            <option value="deliverable">Deliverables</option>
            <option value="requirement_attachment">Requirements / Scope</option>
            <option value="ticket_attachment">Ticket Attachments</option>
            <option value="payment_proof">Payment Receipts</option>
          </select>
          <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
            Filter
          </Button>
        </form>
      </div>

      <div className="space-y-3">
        {filtered.map((file) => {
          const orderObj = Array.isArray(file.order) ? file.order[0] : file.order;
          const delObj = Array.isArray(file.deliverable)
            ? file.deliverable[0]
            : file.deliverable;

          return (
            <Card key={file.id} className="border-border/80 bg-card/85">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                      {file.category.replace(/_/g, ' ')}
                    </Badge>
                    {delObj && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {delObj.code} · {delObj.version_label}
                      </Badge>
                    )}
                    {orderObj && (
                      <Link
                        href={`/portal/orders/${orderObj.id}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {orderObj.code}: {orderObj.title}
                      </Link>
                    )}
                  </div>
                  <div className="break-all font-mono text-sm font-bold">{file.filename}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                    <span>{(file.size_bytes / 1024).toFixed(1)} KB</span>
                    <span>{file.mime_type}</span>
                    {file.sha256_checksum && (
                      <span className="break-all">SHA-256: {file.sha256_checksum}</span>
                    )}
                    <span>Uploaded {new Date(file.created_at).toLocaleDateString()}</span>
                    {file.retention_until && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Retained until {new Date(file.retention_until).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <Button asChild size="sm" className="gap-1.5">
                  <a href={`/api/files/${file.id}/download`}>
                    <Download className="h-3.5 w-3.5" />
                    Secure Download
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FolderLock className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">
                {files && files.length > 0 ? 'No matching vault files' : 'Your Encrypted Vault is empty'}
              </p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Published project deliverables, scope files, and verified receipts appear here automatically.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
