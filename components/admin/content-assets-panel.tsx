import { Image as ImageIcon, UploadCloud } from 'lucide-react';
import { CopyTextButton } from '@/components/admin/copy-text-button';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ConfirmActionButton } from '@/components/panel/confirm-action-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deletePublicAssetAction, uploadPublicAssetAction } from '@/lib/admin/ops-actions';
import {
  assetUrl,
  isPublicR2Configured,
  listPublicObjects,
  type R2ObjectSummary,
} from '@/lib/r2';

/**
 * Public R2 asset manager, rendered inline inside the Content Studio hub so the
 * hub header and tab bar stay in place when switching to this tab.
 */
export async function ContentAssetsPanel() {
  const r2Ready = isPublicR2Configured();
  const baseConfigured = Boolean(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);

  const objects: R2ObjectSummary[] = r2Ready
    ? await listPublicObjects('assets/').catch(() => [])
    : [];

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <Card className="xl:col-span-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UploadCloud className="h-4 w-4 text-primary" />
            Upload Public Asset
          </CardTitle>
          <CardDescription className="text-xs">
            Magic-byte validated PNG, JPEG, WebP, PDF, or ZIP to the public Cloudflare R2 CDN
            bucket. SVG uploads are blocked for XSS safety. Max 15 MB per file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!r2Ready ? (
            <p className="text-xs text-muted-foreground">
              Public R2 storage credentials (R2_PUBLIC_BUCKET) are not configured.
            </p>
          ) : (
            <ActionFeedbackForm
              action={uploadPublicAssetAction}
              successMessage="Public asset uploaded cleanly."
              resetOnSuccess
              className="space-y-3.5"
            >
              <div className="space-y-1.5">
                <Label htmlFor="public-asset-file" className="text-xs">
                  Select Asset File (PNG / JPG / WebP / PDF / ZIP) *
                </Label>
                <Input
                  id="public-asset-file"
                  type="file"
                  name="asset_file"
                  required
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.zip"
                  className="h-9 cursor-pointer text-xs"
                />
              </div>
              <Button type="submit" size="sm" className="w-full rounded-full">
                Upload to Public CDN Bucket
              </Button>
            </ActionFeedbackForm>
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-8">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4 text-primary" />
            Stored Public Objects ({objects.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {objects.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Object Key</TableHead>
                  <TableHead className="text-right text-xs">Size</TableHead>
                  <TableHead className="text-right text-xs">Modified</TableHead>
                  <TableHead className="text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {objects.map((obj) => {
                  let publicHref = obj.key;
                  if (baseConfigured) {
                    try {
                      publicHref = assetUrl(obj.key);
                    } catch {
                      publicHref = obj.key;
                    }
                  }
                  return (
                    <TableRow key={obj.key}>
                      <TableCell>
                        <div className="font-mono text-xs font-semibold">{obj.key}</div>
                        <Badge variant="outline" className="mt-0.5 font-mono text-[9px]">
                          public
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {(obj.size / 1024).toFixed(1)} KB
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                        {obj.lastModified.toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <CopyTextButton value={publicHref} label="Copy URL" />
                          <ConfirmActionButton
                            action={deletePublicAssetAction}
                            hiddenFields={{ key: obj.key }}
                            triggerLabel="Delete"
                            confirmTitle="Delete public CDN asset?"
                            confirmDescription={`Removes ${obj.key} from the public R2 bucket permanently.`}
                            destructive
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No public objects found under assets/.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
