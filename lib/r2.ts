import 'server-only';
import { randomUUID } from 'crypto';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const CONTACT_MAX_FILES = 5;
export const CONTACT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const CONTACT_RETENTION_DAYS = 90;
export const CONTACT_ALLOWED_EXT = ['pdf', 'docx', 'doc', 'xlsx', 'png', 'jpg', 'zip'] as const;

const KEY_RE = /^contact\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$/;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_PRIVATE_BUCKET &&
      process.env.R2_PRIVATE_ACCESS_KEY_ID &&
      process.env.R2_PRIVATE_SECRET_ACCESS_KEY
  );
}

function privateClient(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_PRIVATE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_PRIVATE_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 private credentials missing: set R2_ENDPOINT, R2_PRIVATE_BUCKET, R2_PRIVATE_ACCESS_KEY_ID, R2_PRIVATE_SECRET_ACCESS_KEY'
    );
  }
  return new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
}

export function validateContactFile(
  f: { filename: string; mime: string; size: number }
): { ok: true; ext: string } | { ok: false; error: string } {
  const parts = f.filename.toLowerCase().split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1] : '';
  if (!CONTACT_ALLOWED_EXT.includes(ext as (typeof CONTACT_ALLOWED_EXT)[number])) {
    return { ok: false, error: `File type .${ext || '?'} is not allowed.` };
  }
  if (!Number.isFinite(f.size) || f.size < 1 || f.size > CONTACT_MAX_SIZE_BYTES) {
    return { ok: false, error: 'Files must be between 1 byte and 10 MB.' };
  }
  return { ok: true, ext };
}

export function isValidContactKey(key: string): boolean {
  return KEY_RE.test(key);
}

export async function presignContactUpload(
  filename: string,
  mime: string,
  size: number
): Promise<{ key: string; uploadUrl: string }> {
  const check = validateContactFile({ filename, mime, size });
  if (!check.ok) throw new Error(check.error);

  const key = `contact/${randomUUID()}/${randomUUID()}.${check.ext}`;
  const client = privateClient();
  const cmd = new PutObjectCommand({
    Bucket: process.env.R2_PRIVATE_BUCKET,
    Key: key,
    ContentType: mime,
  });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 600 });
  return { key, uploadUrl };
}

export async function deletePrivateObjects(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  for (const k of keys) {
    if (!isPortalKey(k) && !isValidContactKey(k)) throw new Error('Invalid portal key');
  }
  const client = privateClient();
  const bucket = process.env.R2_PRIVATE_BUCKET;
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    const res = await client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk } })
    );
    deleted += res.Deleted?.length ?? 0;
  }
  return deleted;
}

export interface R2ObjectSummary {
  key: string;
  lastModified: Date;
  size: number;
}

export async function listPrivateContactObjects(): Promise<R2ObjectSummary[]> {
  const client = privateClient();
  const bucket = process.env.R2_PRIVATE_BUCKET;
  const out: R2ObjectSummary[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: 'contact/', ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key && obj.LastModified) {
        out.push({ key: obj.Key, lastModified: obj.LastModified, size: obj.Size ?? 0 });
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export function staleObjectKeys(
  objects: R2ObjectSummary[],
  cutoff: Date,
  retainedKeys: Set<string>
): string[] {
  return objects
    .filter((o) => o.lastModified < cutoff && !retainedKeys.has(o.key))
    .map((o) => o.key);
}

export const ARCHIVE_MAX_BYTES = 100 * 1024 * 1024;
export const ARCHIVE_PREFIX = 'archive/';
export const PENDING_PREFIX = 'pending/';

function sanitizeExt(ext: string): string {
  const sanitized = ext.replace(/^\.+/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!sanitized) throw new Error('Invalid file extension.');
  return sanitized;
}

function assertValidIdPart(value: string, label: string): void {
  if (!value || value === '..' || value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new Error(`Invalid ${label}.`);
  }
}

export function makeDeliverableKey(clientUserId: string, projectId: string, ext: string): string {
  assertValidIdPart(clientUserId, 'client id');
  assertValidIdPart(projectId, 'project id');
  const clean = sanitizeExt(ext);
  return `private/${clientUserId}/project_${projectId}/${randomUUID()}.${clean}`;
}

export function makePendingAttachmentKey(clientUserId: string, ext: string): string {
  assertValidIdPart(clientUserId, 'client id');
  const clean = sanitizeExt(ext);
  return `private/${clientUserId}/pending/${randomUUID()}.${clean}`;
}

export function makeTicketAttachmentKey(clientUserId: string, ticketId: string, ext: string): string {
  assertValidIdPart(clientUserId, 'client id');
  assertValidIdPart(ticketId, 'ticket id');
  const clean = sanitizeExt(ext);
  return `private/${clientUserId}/ticket_${ticketId}/${randomUUID()}.${clean}`;
}

export function isPortalKey(key: string): boolean {
  if (key.startsWith('archive/')) {
    if (key.includes('..') || key.includes('\\') || key.includes('//')) return false;
    if (!key.endsWith('.zip')) return false;
    return key.startsWith('archive/project_');
  }
  return /^private\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//.test(key);
}

export async function presignPrivatePut(key: string, mime: string, expiresIn = 600): Promise<string> {
  if (!isPortalKey(key)) throw new Error('Invalid portal key.');
  const client = privateClient();
  const cmd = new PutObjectCommand({
    Bucket: process.env.R2_PRIVATE_BUCKET,
    Key: key,
    ContentType: mime,
  });
  return getSignedUrl(client, cmd, { expiresIn });
}

export async function presignPrivateGet(key: string, expiresIn = 60): Promise<string> {
  if (!isPortalKey(key)) throw new Error('Invalid portal key.');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = privateClient();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: key }), {
    expiresIn,
  });
}

export async function getPrivateObjectBytes(key: string): Promise<Buffer> {
  if (!isPortalKey(key)) throw new Error('Invalid portal key.');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = privateClient();
  const res = await client.send(
    new GetObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: key })
  );
  const bytes = await res.Body?.transformToByteArray();
  return Buffer.from(bytes ?? []);
}

export async function putPrivateObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!isPortalKey(key)) throw new Error('Invalid portal key.');
  const { Upload } = await import('@aws-sdk/lib-storage');
  const client = privateClient();
  const upload = new Upload({
    client,
    params: {
      Bucket: process.env.R2_PRIVATE_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    },
  });
  await upload.done();
}
