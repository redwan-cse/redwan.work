'use server';

import * as nextCache from 'next/cache';
const { revalidatePath } = nextCache;
import { requireAdminSession } from '@/lib/auth/session';
import { clearBlogCache } from '@/lib/blogger';
import { archivePolicy } from '@/lib/contact/consent-policy';
import { recordAuditLog } from '@/lib/crm/audit';
import { drainEmailOutbox } from '@/lib/email/outbox';
import { extFromFilename, isAllowedAssetMime, resolveMimeType, validateMagicBytes } from '@/lib/mime';
import {
  RESUME_ASSET_KEY,
  deletePrivateObjects,
  deletePublicObject,
  isPortalKey,
  isPublicR2Configured,
  isR2Configured,
  makeAssetKey,
  putPublicObject,
} from '@/lib/r2';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { uuidSchema } from '@/lib/validation/schemas';

const PUBLIC_ASSET_MAX_BYTES = 10 * 1024 * 1024;

export async function drainEmailOutboxAction(): Promise<void> {
  const session = await requireAdminSession();
  const counts = await drainEmailOutbox(30);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'email_outbox.manual_drain',
    entityType: 'email_outbox',
    summary: `Drained email outbox (${counts.accepted} sent, ${counts.deferred} deferred, ${counts.failed} failed)`,
    metadata: counts,
  });

  revalidatePath('/admin/emails');
  revalidatePath('/admin/emails/outbox');
  revalidatePath('/admin/ops');
}

export async function retryOutboxEmailAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const parsedId = uuidSchema.safeParse(formData.get('outbox_id'));
  if (!parsedId.success) {
    throw new Error('Invalid outbox email identifier.');
  }
  const outboxId = parsedId.data;

  const admin = getSupabaseAdmin();
  const outboxTbl = admin.from('email_outbox');
  let nextPayload: Record<string, unknown> | undefined;

  if (typeof outboxTbl.select === 'function') {
    const { data: existing } = await outboxTbl
      .select('id, status, locked_at, payload')
      .eq('id', outboxId)
      .maybeSingle();

    if (!existing) {
      throw new Error('Outbox email record was not found.');
    }
    if (existing.status === 'sent') {
      throw new Error('This email was already delivered and cannot be retried.');
    }
    const staleCutoffMs = Date.now() - 5 * 60_000;
    const isStaleProcessing =
      existing.status === 'processing' &&
      (!existing.locked_at || new Date(existing.locked_at).getTime() < staleCutoffMs);

    if (existing.status !== 'failed' && existing.status !== 'pending' && !isStaleProcessing) {
      throw new Error('This email is currently processing and cannot be retried yet.');
    }

    const basePayload =
      existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload)
        ? (existing.payload as Record<string, unknown>)
        : {};
    const nextRetryNonce = Number(basePayload._retryNonce ?? 0) + 1;
    nextPayload = { ...basePayload, _retryNonce: nextRetryNonce };
  }

  const nowIso = new Date().toISOString();
  const updateBody: Record<string, unknown> = {
    status: 'pending',
    attempts: 0,
    locked_at: null,
    last_error: null,
    next_attempt_at: nowIso,
  };
  if (nextPayload) {
    updateBody.payload = nextPayload;
  }

  const { error } = await admin
    .from('email_outbox')
    .update(updateBody)
    .eq('id', outboxId)
    .neq('status', 'sent');
  if (error) throw new Error(error.message);

  if (process.env.RESEND_API_KEY) {
    await drainEmailOutbox(5).catch(() => undefined);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'email_outbox.retried',
    entityType: 'email_outbox',
    entityId: outboxId,
    summary: `Queued outbox email ${outboxId} for immediate retry`,
  });

  revalidatePath('/admin/emails');
  revalidatePath('/admin/emails/outbox');
  revalidatePath('/admin/ops');
}

export async function retryAllFailedOutboxEmailsAction(): Promise<void> {
  const session = await requireAdminSession();
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const outboxTbl = admin.from('email_outbox');

  let retriedCount = 0;
  if (typeof outboxTbl.select === 'function') {
    // Fetch failed rows so each receives a bumped _retryNonce (fresh Resend Idempotency-Key).
    const { data: failedRows, error: fetchErr } = await outboxTbl
      .select('id, payload')
      .in('status', ['failed'])
      .limit(100);
    if (fetchErr) throw new Error(fetchErr.message);

    for (const row of failedRows ?? []) {
      const basePayload =
        row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {};
      const nextPayload = {
        ...basePayload,
        _retryNonce: Number(basePayload._retryNonce ?? 0) + 1,
      };
      const { error: updErr } = await admin
        .from('email_outbox')
        .update({
          status: 'pending',
          attempts: 0,
          locked_at: null,
          last_error: null,
          next_attempt_at: nowIso,
          payload: nextPayload,
        })
        .eq('id', row.id)
        .eq('status', 'failed');
      if (updErr) throw new Error(updErr.message);
      retriedCount += 1;
    }
  } else {
    const { error } = await outboxTbl
      .update({
        status: 'pending',
        attempts: 0,
        locked_at: null,
        last_error: null,
        next_attempt_at: nowIso,
      })
      .in('status', ['failed']);
    if (error) throw new Error(error.message);
    retriedCount = 1;
  }

  if (retriedCount > 0 && process.env.RESEND_API_KEY) {
    await drainEmailOutbox(20).catch(() => undefined);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'email_outbox.bulk_retried',
    entityType: 'email_outbox',
    summary: `Reset ${retriedCount} failed email(s) for immediate retry`,
    metadata: { retriedCount },
  });

  revalidatePath('/admin/emails');
  revalidatePath('/admin/emails/outbox');
  revalidatePath('/admin/ops');
}

export async function extendVaultRetentionAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const parsedId = uuidSchema.safeParse(formData.get('file_id'));
  const mode = String(formData.get('mode') ?? 'extend_90d').trim();
  if (!parsedId.success) {
    throw new Error('Invalid vault file identifier.');
  }
  const fileId = parsedId.data;

  const admin = getSupabaseAdmin();
  const vaultTbl = admin.from('vault_files');
  let existingRetention: string | null | undefined = undefined;
  if (typeof vaultTbl.select === 'function') {
    const { data: existing, error: existingErr } = await vaultTbl
      .select('id, retention_until, archived_at')
      .eq('id', fileId)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);
    if (!existing || existing.archived_at !== null) {
      throw new Error('Vault file not found or already archived.');
    }
    existingRetention = existing.retention_until;
  }

  if (mode !== 'pin_forever' && existingRetention === null) {
    throw new Error('This file is already pinned forever against auto-expiration.');
  }

  const baseMs =
    existingRetention && Number.isFinite(Date.parse(existingRetention))
      ? Math.max(Date.now(), Date.parse(existingRetention))
      : Date.now();
  const nextRetention =
    mode === 'pin_forever'
      ? null
      : new Date(baseMs + 90 * 86_400_000).toISOString();

  const { data: fileRow, error } = await admin
    .from('vault_files')
    .update({ retention_until: nextRetention })
    .eq('id', fileId)
    .is('archived_at', null)
    .select('filename, owner_client_id, order_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!fileRow) {
    throw new Error('Vault file not found or already archived.');
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId: fileRow?.owner_client_id ?? null,
    orderId: fileRow?.order_id ?? null,
    action: 'vault_file.retention_updated',
    entityType: 'vault_file',
    entityId: fileId,
    summary:
      mode === 'pin_forever'
        ? `Pinned "${fileRow?.filename ?? fileId}" against auto-expiration`
        : `Extended retention +90 days for "${fileRow?.filename ?? fileId}"`,
  });

  revalidatePath('/admin/recovery');
  revalidatePath('/admin/ops');
  revalidatePath('/portal/files');
}

export async function purgeOrphanPrivateObjectAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const r2Key = String(formData.get('r2_key') ?? '').trim();
  if (!r2Key) {
    throw new Error('Missing private R2 object key.');
  }
  if (!isPortalKey(r2Key) && !r2Key.startsWith('contact/')) {
    throw new Error('Invalid private R2 key prefix.');
  }
  if (!isR2Configured()) {
    throw new Error('Private R2 storage is not configured.');
  }

  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const vaultEq = admin.from('vault_files').select('id').eq('r2_key', r2Key);
  const vaultQuery =
    typeof vaultEq.is === 'function' ? vaultEq.is('archived_at', null).limit(1) : vaultEq.limit(1);
  const reservationEq = admin.from('vault_upload_reservations').select('id').eq('r2_key', r2Key);
  const reservationQuery =
    typeof reservationEq.gt === 'function'
      ? reservationEq
          .gt('expires_at', nowIso)
          .limit(1)
          .then((res) => res, () => ({ data: [] as Array<{ id: string }>, error: null }))
      : Promise.resolve({ data: [] as Array<{ id: string }>, error: null });

  const [{ data: vaultRefs, error: vaultRefErr }, { data: inquiryRefs, error: inqRefErr }, activeRes] =
    await Promise.all([
      vaultQuery,
      admin.from('inquiry_attachments').select('id').eq('r2_key', r2Key).limit(1),
      reservationQuery,
    ]);
  if (vaultRefErr || inqRefErr) {
    throw new Error('Could not verify whether storage object is still referenced.');
  }
  if (
    (vaultRefs && vaultRefs.length > 0) ||
    (inquiryRefs && inquiryRefs.length > 0) ||
    (activeRes?.data && activeRes.data.length > 0)
  ) {
    throw new Error(
      'Cannot purge storage object: key is referenced by an active database record or an in-flight upload reservation.'
    );
  }

  await deletePrivateObjects([r2Key]);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'storage.orphan_purged',
    entityType: 'r2_object',
    summary: `Manually purged unlinked private R2 object ${r2Key}`,
    metadata: { r2Key },
  });

  revalidatePath('/admin/recovery');
  revalidatePath('/admin/ops');
}

export async function uploadPublicAssetAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  if (!isPublicR2Configured()) {
    throw new Error('Public R2 asset bucket is not configured.');
  }

  const file = formData.get('asset_file');
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error('Select a valid image, PDF, or ZIP asset file.');
  }
  if (file.size > PUBLIC_ASSET_MAX_BYTES) {
    throw new Error('Public assets are limited to 10 MB per file.');
  }

  const ext = extFromFilename(file.name);
  const resolvedMime = resolveMimeType(file.name, file.type);
  if (!ext || !isAllowedAssetMime(ext, resolvedMime)) {
    throw new Error(`Disallowed public asset type/extension: ${resolvedMime}`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!validateMagicBytes(bytes, resolvedMime)) {
    throw new Error('File contents do not match its declared extension/MIME signature.');
  }

  const key = makeAssetKey(ext || 'bin');
  const needsAttachmentDisposition =
    resolvedMime === 'application/pdf' ||
    resolvedMime === 'application/zip' ||
    resolvedMime === 'application/x-zip-compressed';
  await putPublicObject(key, bytes, resolvedMime, {
    cacheControl: 'public, max-age=31536000, immutable',
    ...(needsAttachmentDisposition ? { contentDisposition: 'attachment' } : {}),
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'asset.public_uploaded',
    entityType: 'r2_public_asset',
    summary: `Uploaded public asset ${file.name} (${key})`,
    metadata: { key, mime: resolvedMime, sizeBytes: file.size },
  });

  revalidatePath('/admin/content');
  revalidatePath('/admin/assets');
}

export async function deletePublicAssetAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const key = String(formData.get('key') ?? '').trim();
  if (!key) {
    throw new Error('Missing public asset key.');
  }
  if (!isPublicR2Configured()) {
    throw new Error('Public R2 storage is not configured.');
  }

  // Prevent accidentally deleting the active canonical resume PDF referenced by site_settings
  if (key === RESUME_ASSET_KEY) {
    throw new Error('Cannot delete the active canonical resume PDF asset. Replace it via Resume PDF upload instead.');
  }
  const admin = getSupabaseAdmin();
  const { data: settings } = await admin
    .from('site_settings')
    .select('resume_pdf_url')
    .eq('id', 'default')
    .maybeSingle();
  if (settings?.resume_pdf_url && settings.resume_pdf_url.includes(key)) {
    throw new Error('Cannot delete a public asset actively referenced in site settings.');
  }

  await deletePublicObject(key);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'asset.public_deleted',
    entityType: 'r2_public_asset',
    summary: `Deleted public asset ${key}`,
    metadata: { key },
  });

  revalidatePath('/admin/content');
  revalidatePath('/admin/assets');
}

export async function syncBloggerCacheAction(): Promise<void> {
  const session = await requireAdminSession();
  clearBlogCache();
  const cacheMod = nextCache as {
    updateTag?: (tag: string) => void;
    revalidateTag?: (tag: string, profile: string | { expire?: number }) => void;
  };
  if (typeof cacheMod.updateTag === 'function') {
    cacheMod.updateTag('blogs');
  } else if (typeof cacheMod.revalidateTag === 'function') {
    cacheMod.revalidateTag('blogs', { expire: 0 });
  }
  revalidatePath('/blogs');
  revalidatePath('/');
  revalidatePath('/sitemap.xml');
  revalidatePath('/llms-full.txt');

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'blogs.cache_synced',
    entityType: 'blogger_cache',
    summary: 'Cleared in-memory Blogger cache and revalidated public blog routes',
  });

  revalidatePath('/admin/content');
  revalidatePath('/admin/blogs');
}

export async function publishConsentPolicyAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const version = String(formData.get('version') ?? '').trim();
  const normalizeLf = (raw: FormDataEntryValue | null) =>
    String(raw ?? '')
      .replace(/\r\n/g, '\n')
      .trim();

  const checkboxRaw = normalizeLf(formData.get('checkbox'));
  const privacyNoticeRaw = normalizeLf(formData.get('privacy_notice'));
  const attachmentNoticeRaw = normalizeLf(formData.get('attachment_notice'));
  const policyTextRaw = normalizeLf(formData.get('policy_text'));
  const rawCanonical = normalizeLf(formData.get('canonical'));

  let bundleCandidate: unknown;
  if (checkboxRaw && privacyNoticeRaw && attachmentNoticeRaw && policyTextRaw) {
    bundleCandidate = {
      version,
      checkbox: checkboxRaw,
      privacyNotice: privacyNoticeRaw,
      attachmentNotice: attachmentNoticeRaw,
      policyText: policyTextRaw,
    };
  } else if (rawCanonical) {
    try {
      const parsed = JSON.parse(rawCanonical) as Record<string, unknown>;
      bundleCandidate = {
        ...parsed,
        version: version || parsed.version,
      };
    } catch {
      if (rawCanonical.length < 20) {
        throw new Error(
          'Provide a lowercase policy version and full structured consent notice fields.'
        );
      }
      bundleCandidate = {
        version,
        checkbox: 'I have read and agree to the Data & Privacy Policy and Terms of Service.',
        privacyNotice:
          'Inquiry details are processed strictly for security & engineering scope evaluation.',
        attachmentNotice:
          'Uploaded scope files are stored privately in encrypted R2 storage and purged after retention expiry.',
        policyText: rawCanonical,
      };
    }
  } else {
    throw new Error(
      'Provide a lowercase policy version, checkbox label, privacy notice, attachment notice, and policy text.'
    );
  }

  const archived = archivePolicy(bundleCandidate);
  const admin = getSupabaseAdmin();

  const { error: pubErr } = await admin.rpc('publish_consent_policy_atomic', {
    p_version: archived.version,
    p_canonical: archived.canonical,
    p_hash: archived.hash,
    p_admin_id: session.userId,
  });
  if (pubErr) throw new Error(pubErr.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'consent_policy.published',
    entityType: 'consent_policy',
    summary: `Published and activated consent policy ${archived.version} (${archived.hash.slice(0, 12)}…)`,
    metadata: { version: archived.version, hash: archived.hash },
  });

  revalidatePath('/admin/settings');
  revalidatePath('/admin/ops');
  revalidatePath('/contact');
}
