import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { getSiteSettingsAndResume } from '@/lib/cms/queries';
import { generateResumePdf } from '@/lib/resume/pdf';

let cachedCehLogoBytes: Uint8Array | null | undefined;

async function loadCehLogoBytes(): Promise<Uint8Array | null> {
  if (cachedCehLogoBytes !== undefined) {
    return cachedCehLogoBytes;
  }
  try {
    const logoPath = path.join(process.cwd(), 'public', 'ceh-logo.jpg');
    const bytes = await fs.readFile(logoPath);
    cachedCehLogoBytes = new Uint8Array(bytes);
  } catch {
    cachedCehLogoBytes = null;
  }
  return cachedCehLogoBytes;
}

export async function serveDynamicResumePdf(
  request: NextRequest,
  options?: { robotsTag?: string }
): Promise<Response> {
  const [{ settings, items }, cehLogoBytes] = await Promise.all([
    getSiteSettingsAndResume(),
    loadCehLogoBytes(),
  ]);

  const generatedAt = new Date();
  const pdfBytes = await generateResumePdf({
    settings,
    items,
    cehLogoBytes,
    generatedAt,
  });

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
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Resume-Generated-At': generatedAt.toISOString(),
  });

  if (options?.robotsTag) {
    headers.set('X-Robots-Tag', options.robotsTag);
  }

  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers,
  });
}
