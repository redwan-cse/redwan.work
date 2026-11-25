import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getSiteSettingsAndResume } from '@/lib/cms/queries';
import {
  RESUME_ASSET_KEY,
  RESUME_PDF_MAX_BYTES,
  extractPublicAssetKeyFromUrl,
  getPublicObjectBytes,
} from '@/lib/r2';
import { trySanitizeHttpUrl } from '@/lib/security/safe-redirect';
import { resumeDownloadQuerySchema } from '@/lib/validation/schemas';

async function readBoundedResponse(
  response: Response,
  maxBytes: number
): Promise<Buffer | null> {
  if (!response.body) {
    const ab = await response.arrayBuffer();
    if (ab.byteLength <= 0 || ab.byteLength > maxBytes) return null;
    return Buffer.from(ab);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total <= 0) return null;
  return Buffer.concat(chunks, total);
}

function allowedPublicAssetOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export async function serveStoredResumePdf(
  request: NextRequest,
  options?: { robotsTag?: string }
): Promise<Response> {
  const { settings } = await getSiteSettingsAndResume({ skipResumeItems: true });
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
    const safeRemoteUrl = trySanitizeHttpUrl(configuredUrl);
    const pinnedOrigin = allowedPublicAssetOrigin();
    if (safeRemoteUrl && pinnedOrigin) {
      let targetUrl: URL | null = null;
      try {
        targetUrl = new URL(safeRemoteUrl);
      } catch {
        targetUrl = null;
      }
      if (targetUrl && targetUrl.origin === pinnedOrigin) {
        try {
          const res = await fetch(targetUrl.toString(), {
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(8000),
          });
          const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
          const declaredLen = Number(res.headers.get('content-length') ?? 0);
          if (
            res.ok &&
            contentType.includes('application/pdf') &&
            (!Number.isFinite(declaredLen) || declaredLen <= RESUME_PDF_MAX_BYTES)
          ) {
            const buf = await readBoundedResponse(res, RESUME_PDF_MAX_BYTES);
            if (
              buf &&
              buf.byteLength > 0 &&
              buf.byteLength <= RESUME_PDF_MAX_BYTES &&
              buf.subarray(0, 5).toString('ascii') === '%PDF-'
            ) {
              pdfBytes = buf;
            }
          }
        } catch {
          pdfBytes = null;
        }
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
  const parsedQuery = resumeDownloadQuerySchema.safeParse({
    download: url.searchParams.get('download'),
  });
  const downloadParam = parsedQuery.success ? parsedQuery.data.download : null;
  const forceDownload = downloadParam === '1' || downloadParam === 'true';

  const safeBaseName = (settings.full_name || 'Md_Redwan_Ahmed')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const filename = `${safeBaseName || 'Md_Redwan_Ahmed'}_Resume.pdf`;

  const etag = `W/"${createHash('sha256').update(pdfBytes).digest('hex').slice(0, 16)}"`;
  const cacheControl = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

  if (request.headers.get('if-none-match') === etag) {
    const notModifiedHeaders = new Headers({
      ETag: etag,
      'Cache-Control': cacheControl,
      'X-Resume-Storage': 'r2-public',
    });
    if (options?.robotsTag) {
      notModifiedHeaders.set('X-Robots-Tag', options.robotsTag);
    }
    return new Response(null, { status: 304, headers: notModifiedHeaders });
  }

  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${forceDownload ? 'attachment' : 'inline'}; filename="${filename}"`,
    'Content-Length': String(pdfBytes.byteLength),
    ETag: etag,
    'Cache-Control': cacheControl,
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
