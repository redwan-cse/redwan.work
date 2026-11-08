import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download, FolderLock, ShieldCheck } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ClientVaultFilesPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/files');

  const admin = getSupabaseAdmin();
  const { data: files } = await admin
    .from('vault_files')
    .select(
      'id, category, filename, mime_type, size_bytes, sha256_checksum, download_count, created_at, order:orders(id, code, title), deliverable:deliverables(id, code, version_label, title, status)'
    )
    .eq('owner_client_id', session.userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            <ShieldCheck className="mr-1 h-3.5 w-3.5 text-primary" />
            Encrypted Deliverables Vault
          </Badge>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Encrypted Deliverables &amp; File Vault
        </h1>
        <p className="text-sm text-muted-foreground">
          Download VAPT audit reports, source code archives, architecture diagrams, and payment receipts via short-lived 120-second signed URLs.
        </p>
      </div>

      <div className="space-y-3">
        {(files ?? []).map((file) => {
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
                        {delObj.code} • {delObj.version_label}
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
                  <div className="flex flex-wrap gap-4 font-mono text-[11px] text-muted-foreground">
                    <span>{(file.size_bytes / 1024).toFixed(1)} KB</span>
                    <span>{file.mime_type}</span>
                    {file.sha256_checksum && (
                      <span className="break-all">SHA-256: {file.sha256_checksum.slice(0, 20)}…</span>
                    )}
                    <span>Uploaded {new Date(file.created_at).toLocaleDateString()}</span>
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

        {(files ?? []).length === 0 && (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FolderLock className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">Your Encrypted Vault is empty</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Published project deliverables, penetration testing reports, and verified receipts will appear here automatically.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
