'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/session';
import { clearBlogCache } from '@/lib/blogger';
import { archivePolicy } from '@/lib/contact/consent-policy';
import { recordAuditLog } from '@/lib/crm/audit';
import { drainEmailOutbox } from '@/lib/email/outbox';
import { extFromFilename, resolveMimeType, validateMagicBytes } from '@/lib/mime';
import {
  deletePrivateObjects,
  deletePublicObject,
  isPortalKey,
  isPublicR2Configured,
  isR2Configured,
  makeAssetKey,
  putPublicObject,
} from '@/lib/r2';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const PUBLIC_ASSET_ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/zip',
]);

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
  const outboxId = String(formData.get('outbox_id') ?? '').trim();
  if (!outboxId) return;

  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from('email_outbox')
    .update({
      status: 'pending',
      attempts: 0,
      locked_at: null,
      last_error: null,
      next_attempt_at: nowIso,
    })
    .eq('id', outboxId);
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
}

export async function extendVaultRetentionAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const fileId = String(formData.get('file_id') ?? '').trim();
  const mode = String(formData.get('mode') ?? 'extend_90d').trim();
  if (!fileId) return;

  const nextRetention =
    mode === 'pin_forever'
      ? null
      : new Date(Date.now() + 90 * 86_400_000).toISOString();

  const admin = getSupabaseAdmin();
  const { data: fileRow, error } = await admin
    .from('vault_files')
    .update({ retention_until: nextRetention })
    .eq('id', fileId)
    .select('filename, owner_client_id, order_id')
    .maybeSingle();
  if (error) throw new Error(error.message);

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
  revalidatePath('/portal/files');
}

export async function purgeOrphanPrivateObjectAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const r2Key = String(formData.get('r2_key') ?? '').trim();
  if (!r2Key) return;
  if (!isPortalKey(r2Key) && !r2Key.startsWith('contact/')) {
    throw new Error('Invalid private R2 key prefix.');
  }
  if (!isR2Configured()) {
    throw new Error('Private R2 storage is not configured.');
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
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Public assets are limited to 15 MB per file.');
  }

  const ext = extFromFilename(file.name);
  const resolvedMime = resolveMimeType(file.name, file.type);
  if (!PUBLIC_ASSET_ALLOWED_MIME.has(resolvedMime)) {
    throw new Error(`Disallowed public asset MIME type: ${resolvedMime}`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!validateMagicBytes(bytes, resolvedMime)) {
    throw new Error('File contents do not match its declared extension/MIME signature.');
  }

  const key = makeAssetKey(ext || 'bin');
  await putPublicObject(key, bytes, resolvedMime, {
    cacheControl: 'public, max-age=31536000, immutable',
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
}

export async function deletePublicAssetAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const key = String(formData.get('key') ?? '').trim();
  if (!key) return;
  if (!isPublicR2Configured()) {
    throw new Error('Public R2 storage is not configured.');
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
}

export async function syncBloggerCacheAction(): Promise<void> {
  const session = await requireAdminSession();
  clearBlogCache();
  revalidatePath('/blogs');
  revalidatePath('/');
  revalidatePath('/sitemap.xml');

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'blogs.cache_synced',
    entityType: 'blogger_cache',
    summary: 'Cleared in-memory Blogger cache and revalidated public blog routes',
  });

  revalidatePath('/admin/content');
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

  const { error: deactErr } = await admin
    .from('consent_policies')
    .update({ is_active: false })
    .eq('is_active', true);
  if (deactErr) throw new Error(deactErr.message);

  const { error: insErr } = await admin.from('consent_policies').upsert(
    {
      version: archived.version,
      canonical: archived.canonical,
      hash: archived.hash,
      is_active: true,
    },
    { onConflict: 'version' }
  );
  if (insErr) throw new Error(insErr.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'consent_policy.published',
    entityType: 'consent_policy',
    entityId: archived.version,
    summary: `Published and activated consent policy ${archived.version} (${archived.hash.slice(0, 12)}…)`,
    metadata: { version: archived.version, hash: archived.hash },
  });

  revalidatePath('/admin/settings');
  revalidatePath('/admin/ops');
  revalidatePath('/contact');
}
