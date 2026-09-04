// Single shared ext → mime allowlist for contact AND public-asset flows.
// Contact uploads additionally gate ext via CONTACT_ALLOWED_EXT (lib/r2.ts);
// asset uploads gate ext via ASSET_ALLOWED_EXT (lib/r2.ts). The webp/svg/avif
// rows only serve assets: contact callers run validateContactFile first, which
// rejects those extensions before isAllowedMime is ever consulted.
export const CONTACT_ALLOWED: Record<string, readonly string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['application/msword'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  zip: ['application/zip', 'application/x-zip-compressed'],
  webp: ['image/webp'],
  svg: ['image/svg+xml'],
  avif: ['image/avif'],
};
export function extFromFilename(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}
export function isAllowedMime(ext: string, mime: string): boolean {
  const normalized = mime.trim().toLowerCase().split(';')[0].trim();
  return (CONTACT_ALLOWED[ext] ?? []).includes(normalized);
}
