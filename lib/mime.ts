// Shared ext → mime allowlists. CONTACT_ALLOWED is the contact-flow map (original
// 7 entries — do not extend: presign routes gate on it). Public-asset uploads use
// the separate ASSET_ALLOWED map via isAllowedAssetMime.
export const CONTACT_ALLOWED: Record<string, readonly string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['application/msword'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};
export const ASSET_ALLOWED: Record<string, readonly string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  webp: ['image/webp'],
  svg: ['image/svg+xml'],
  avif: ['image/avif'],
  pdf: ['application/pdf'],
};
export function extFromFilename(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}
export function isAllowedMime(
  ext: string,
  mime: string,
  allowlist: Record<string, readonly string[]> = CONTACT_ALLOWED
): boolean {
  const normalized = mime.trim().toLowerCase().split(';')[0].trim();
  return (allowlist[ext] ?? []).includes(normalized);
}
export function isAllowedAssetMime(ext: string, mime: string): boolean {
  return isAllowedMime(ext, mime, ASSET_ALLOWED);
}
