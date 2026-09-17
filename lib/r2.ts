import 'server-only';
import { randomUUID } from 'crypto';
import { DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isAllowedMime } from '@/lib/mime';

export const CONTACT_MAX_FILES = 5;
export const CONTACT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const CONTACT_RETENTION_DAYS = 90;
export const CONTACT_ALLOWED_EXT = ['pdf', 'docx', 'doc', 'xlsx', 'png', 'jpg', 'zip'] as const;
const KEY_RE = /^contact\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$/;

export function isR2Configured(): boolean {
  return Boolean(process.env.R2_ENDPOINT && process.env.R2_PRIVATE_BUCKET && process.env.R2_PRIVATE_ACCESS_KEY_ID && process.env.R2_PRIVATE_SECRET_ACCESS_KEY);
}
function privateClient(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_PRIVATE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_PRIVATE_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey || !process.env.R2_PRIVATE_BUCKET) throw new Error('Private storage is not configured.');
  return new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
}
export function validateContactFile(f: { filename: string; mime: string; size: number }): { ok: true; ext: string } | { ok: false; error: string } {
  if (!f || typeof f.filename !== 'string' || !f.filename.trim() || f.filename.length > 255 || typeof f.mime !== 'string' || f.mime.length > 128) return { ok: false, error: 'Invalid file metadata.' };
  const parts = f.filename.toLowerCase().split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1] : '';
  if (!CONTACT_ALLOWED_EXT.includes(ext as (typeof CONTACT_ALLOWED_EXT)[number])) return { ok: false, error: 'File type is not allowed.' };
  if (!Number.isSafeInteger(f.size) || f.size < 1 || f.size > CONTACT_MAX_SIZE_BYTES) return { ok: false, error: 'Files must be between 1 byte and 10 MB.' };
  if (!isAllowedMime(ext, f.mime)) return { ok: false, error: 'File type does not match its extension.' };
  return { ok: true, ext };
}
export function isValidContactKey(key: string): boolean { return typeof key === 'string' && KEY_RE.test(key); }
export async function presignContactUpload(filename: string, mime: string, size: number): Promise<{ key: string; uploadUrl: string }> {
  const check = validateContactFile({ filename, mime, size });
  if (!check.ok) throw new Error(check.error);
  const key = `contact/${randomUUID()}/${randomUUID()}.${check.ext}`;
  const command = new PutObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: key, ContentType: mime, ContentLength: size });
  return { key, uploadUrl: await getSignedUrl(privateClient(), command, { expiresIn: 600 }) };
}
export async function deletePrivateObjects(keys: string[]): Promise<number> {
  const unique = [...new Set(keys)];
  if (!unique.length) return 0;
  for (const key of unique) if (!isPortalKey(key) && !isValidContactKey(key)) throw new Error('Invalid private key.');
  const client = privateClient();
  let deleted = 0;
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    const response = await client.send(new DeleteObjectsCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Delete: { Objects: chunk.map(Key => ({ Key })), Quiet: false } }));
    const confirmed = new Set((response.Deleted ?? []).map(item => item.Key));
    // Do not let callers remove tracking rows after a partial or ambiguous delete.
    // Retrying the same keys is safe: deleting a missing S3 object is idempotent.
    if (response.Errors?.length || chunk.some(key => !confirmed.has(key))) throw new Error('Storage deletion incomplete. Tracking records retained; retry required.');
    deleted += chunk.length;
  }
  return deleted;
}
export interface R2ObjectSummary { key: string; lastModified: Date; size: number; }
export async function listPrivateObjects(prefix: string): Promise<R2ObjectSummary[]> {
  const client = privateClient();
  const out: R2ObjectSummary[] = [];
  const tokens = new Set<string>();
  let token: string | undefined;
  do {
    const response = await client.send(new ListObjectsV2Command({ Bucket: process.env.R2_PRIVATE_BUCKET, Prefix: prefix, ContinuationToken: token }));
    for (const obj of response.Contents ?? []) {
      if (!obj.Key || !obj.LastModified) throw new Error('Storage inventory incomplete.');
      out.push({ key: obj.Key, lastModified: obj.LastModified, size: obj.Size ?? 0 });
    }
    if (!response.IsTruncated) break;
    token = response.NextContinuationToken;
    if (!token || tokens.has(token)) throw new Error('Storage inventory incomplete.');
    tokens.add(token);
  } while (token);
  return out;
}
export async function listPrivateContactObjects(): Promise<R2ObjectSummary[]> { return listPrivateObjects('contact/'); }
export function staleObjectKeys(objects: R2ObjectSummary[], cutoff: Date, retainedKeys: Set<string>): string[] {
  return objects.filter(o => o.lastModified < cutoff && !retainedKeys.has(o.key)).map(o => o.key);
}
export const ARCHIVE_MAX_BYTES = 100 * 1024 * 1024;
export const ARCHIVE_PREFIX = 'archive/';
function sanitizeExt(ext: string): string {
  const sanitized = ext.replace(/^\.+/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!sanitized) throw new Error('Invalid file extension.');
  return sanitized;
}
function assertValidIdPart(value: string, label: string): void {
  if (!value || value.includes('/') || value.includes('\\') || value.includes('..')) throw new Error(`Invalid ${label}.`);
}
export function makeDeliverableKey(clientUserId: string, projectId: string, ext: string): string {
  assertValidIdPart(clientUserId, 'client id'); assertValidIdPart(projectId, 'project id');
  return `private/${clientUserId}/project_${projectId}/${randomUUID()}.${sanitizeExt(ext)}`;
}
export function makePendingAttachmentKey(clientUserId: string, ext: string): string {
  assertValidIdPart(clientUserId, 'client id');
  return `private/${clientUserId}/pending/${randomUUID()}.${sanitizeExt(ext)}`;
}
export function makeTicketAttachmentKey(clientUserId: string, ticketId: string, ext: string): string {
  assertValidIdPart(clientUserId, 'client id'); assertValidIdPart(ticketId, 'ticket id');
  return `private/${clientUserId}/ticket_${ticketId}/${randomUUID()}.${sanitizeExt(ext)}`;
}
export function isPortalKey(key: string): boolean {
  if (typeof key !== 'string' || key.includes('..') || key.includes('\\') || key.includes('//')) return false;
  if (key.startsWith('archive/')) return key.startsWith('archive/project_') && key.endsWith('.zip');
  return /^private\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//.test(key);
}
export async function presignPrivatePut(key: string, mime: string, size: number, expiresIn = 600): Promise<string> {
  if (!isPortalKey(key)) throw new Error('Invalid portal key.');
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('Invalid file size.');
  return getSignedUrl(privateClient(), new PutObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: key, ContentType: mime, ContentLength: size }), { expiresIn });
}
export async function getPrivateObjectSize(key: string): Promise<number | null> {
  // HEAD is shared by the two private-bucket upload namespaces. GET remains portal-only.
  if (!isPortalKey(key) && !isValidContactKey(key)) throw new Error('Invalid private key.');
  try {
    const response = await privateClient().send(new HeadObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: key }));
    return response.ContentLength ?? null;
  } catch (error) {
    if (error instanceof Error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) return null;
    throw error;
  }
}
export async function verifyStoredObjectSize(key: string, declared: number): Promise<boolean> {
  if (!Number.isSafeInteger(declared) || declared < 1 || declared > CONTACT_MAX_SIZE_BYTES) return false;
  return await getPrivateObjectSize(key) === declared;
}
export async function presignPrivateGet(key: string, expiresIn = 60): Promise<string> {
  if (!isPortalKey(key)) throw new Error('Invalid portal key.');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  return getSignedUrl(privateClient(), new GetObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: key }), { expiresIn });
}
export async function getPrivateObjectBytes(key: string): Promise<Buffer> {
  if (!isPortalKey(key)) throw new Error('Invalid portal key.');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const response = await privateClient().send(new GetObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: key }));
  return Buffer.from(await response.Body?.transformToByteArray() ?? []);
}
export async function putPrivateObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!isPortalKey(key)) throw new Error('Invalid portal key.');
  const { Upload } = await import('@aws-sdk/lib-storage');
  await new Upload({ client: privateClient(), params: { Bucket: process.env.R2_PRIVATE_BUCKET, Key: key, Body: body, ContentType: contentType } }).done();
}
export const ASSET_ALLOWED_EXT = ['png', 'jpg', 'webp', 'svg', 'avif', 'pdf'] as const;
export const ASSET_MAX_BYTES = 5 * 1024 * 1024;
export function makeAssetKey(ext: string): string {
  const clean = ext.replace(/^\.+/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!(ASSET_ALLOWED_EXT as readonly string[]).includes(clean)) throw new Error('Invalid asset extension.');
  return `assets/${new Date().getUTCFullYear()}/${randomUUID().replace(/-/g, '')}.${clean}`;
}
export function assetUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!base) throw new Error('Public asset base URL is not configured.');
  assertValidAssetKey(key);
  return `${base}/${key}`;
}
function publicClient(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_PUBLIC_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_PUBLIC_SECRET_ACCESS_KEY;
  if (!endpoint || !process.env.R2_PUBLIC_BUCKET || !accessKeyId || !secretAccessKey) throw new Error('Public storage is not configured.');
  return new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
}
function assertValidAssetKey(key: string): void {
  if (typeof key !== 'string' || !key.startsWith('assets/') || key.includes('..')) throw new Error('Invalid asset key.');
}
export async function putPublicObject(key: string, body: Buffer, contentType: string): Promise<void> {
  assertValidAssetKey(key);
  await publicClient().send(new PutObjectCommand({ Bucket: process.env.R2_PUBLIC_BUCKET, Key: key, Body: body, ContentType: contentType }));
}
export async function deletePublicObject(key: string): Promise<void> {
  assertValidAssetKey(key);
  await publicClient().send(new DeleteObjectCommand({ Bucket: process.env.R2_PUBLIC_BUCKET, Key: key }));
}
