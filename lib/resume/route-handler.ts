import type { NextRequest } from 'next/server';
import { getSiteSettingsAndResume } from '@/lib/cms/queries';
import {
  RESUME_ASSET_KEY,
  extractPublicAssetKeyFromUrl,
  getPublicObjectBytes,
} from '@/lib/r2';
import { sanitizeHttpUrl } from '@/lib/security/safe-redirect';

export async function serveStoredResumePdf(
  request: NextRequest,
  options?: { robotsTag?: string }
): Promise<Response> {
  const { settings } = await getSiteSettingsAndResume();
  const configuredUrl = (settings.resume_pdf_url || '').trim();
  const assetKey = extractPublicAssetKeyFromUrl(configuredUrl) ?? RESUME_ASSET_KEY;

  let pdfBytes: Buffer | null = null;

  if (
    process.env.R2_ENDPOINT &&
    process.env.R2_PUBLIC_BUCKET &&
    process.env.R2_PUBLIC_ACCESS_KEY_ID &&
    process.env.R2_PUBLIC_SECRET_ACCESS_KEY
  ) {
    try {
      pdfBytes = await getPublicObjectBytes(assetKey);
      if (!pdfBytes && assetKey !== RESUME_ASSET_KEY) {
        pdfBytes = await getPublicObjectBytes(RESUME_ASSET_KEY);
      }
    } catch {
      pdfBytes = null;
    }
  }

  if (!pdfBytes) {
    const safeRemoteUrl = sanitizeHttpUrl(configuredUrl);
    if (safeRemoteUrl) {
      try {
        const res = await fetch(safeRemoteUrl, { cache: 'no-store' });
        if (res.ok) {
          pdfBytes = Buffer.from(await res.arrayBuffer());
        }
      } catch {
        pdfBytes = null;
      }
    }
  }

  if (!pdfBytes || pdfBytes.byteLength === 0) {
    return new Response('Resume PDF is not found in R2 public storage.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const url = new URL(request.url);
  const downloadParam = url.searchParams.get('download');
  const forceDownload = downloadParam === '1' || downloadParam === 'true';

  const safeBaseName = (settings.full_name || 'Md_Redwan_Ahmed')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const filename = `${safeBaseName || 'Md_Redwan_Ahmed'}_Resume.pdf`;

  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${forceDownload ? 'attachment' : 'inline'}; filename="${filename}"`,
    'Content-Length': String(pdfBytes.byteLength),
    'Cache-Control': 'public, max-age=300, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'X-Resume-Storage': 'r2-public',
  });

  if (options?.robotsTag) {
    headers.set('X-Robots-Tag', options.robotsTag);
  }

  return new Response(new Uint8Array(pdfBytes), {
    status: 200,
    headers,
  });
}
