import { ASSET_ALLOWED_EXT, ASSET_MAX_BYTES } from '@/lib/r2';
import { formatBytes } from '@/lib/format';
import { AssetUploader } from './asset-uploader';

export const dynamic = 'force-dynamic';

export default function AdminAssetsPage() {
  const accept = ASSET_ALLOWED_EXT.map((ext) => `.${ext}`).join(',');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Assets</h1>
        <p className="text-sm text-muted-foreground">Public bucket · up to {formatBytes(ASSET_MAX_BYTES)} per file</p>
      </div>

      <p className="text-sm text-muted-foreground">
        Upload portfolio or blog images to the public bucket. Files are served from the CDN
        immediately — use the URL in portfolio entries or blog posts. Nothing is written to
        the database.
      </p>

      <AssetUploader accept={accept} maxBytes={ASSET_MAX_BYTES} />
    </div>
  );
}
