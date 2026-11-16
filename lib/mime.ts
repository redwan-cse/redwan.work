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
export const PORTAL_ALLOWED: Record<string, readonly string[]> = {
  ...CONTACT_ALLOWED,
  webp: ['image/webp'],
};
export const ASSET_ALLOWED: Record<string, readonly string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  webp: ['image/webp'],
  avif: ['image/avif'],
  pdf: ['application/pdf'],
};

export function validateMagicBytes(bytes: Uint8Array, mime: string): boolean {
  const m = mime.trim().toLowerCase().split(';')[0].trim();
  if (bytes.length < 4) return false;
  const startsWith = (seq: number[], offset = 0) =>
    bytes.length >= offset + seq.length && seq.every((b, idx) => bytes[offset + idx] === b);
  const asciiAt = (offset: number, expected: string) => {
    if (bytes.length < offset + expected.length) return false;
    for (let i = 0; i < expected.length; i += 1) {
      if (bytes[offset + i] !== expected.charCodeAt(i)) return false;
    }
    return true;
  };

  switch (m) {
    case 'application/pdf':
      return asciiAt(0, '%PDF-');
    case 'image/png':
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
    case 'image/jpg':
      return startsWith([0xff, 0xd8, 0xff]);
    case 'image/webp':
      return asciiAt(0, 'RIFF') && asciiAt(8, 'WEBP');
    case 'image/avif':
      return asciiAt(4, 'ftyp');
    case 'application/zip':
    case 'application/x-zip-compressed':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06]);
    case 'application/msword':
      return startsWith([0xd0, 0xcf, 0x11, 0xe0]) || asciiAt(0, '{\\rtf');
    default:
      return false;
  }
}
export function extFromFilename(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}
export function resolveMimeType(filename: string, providedMime?: string | null): string {
  const normalized = (providedMime ?? '').trim().toLowerCase().split(';')[0].trim();
  if (normalized && normalized !== 'application/octet-stream') {
    return normalized;
  }
  const ext = extFromFilename(filename);
  return PORTAL_ALLOWED[ext]?.[0] ?? 'application/octet-stream';
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
