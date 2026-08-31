'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { createTicket, clientReply } from '@/lib/crm/tickets';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createFileRow } from '@/lib/crm/files';
import {
  CONTACT_ALLOWED_EXT,
  isPortalKey,
  makePendingAttachmentKey,
  makeTicketAttachmentKey,
  presignPrivatePut,
  validateContactFile,
} from '@/lib/r2';

export type PortalActionState = { error?: string; notice?: string };

async function requireClient() {
  const session = await getCurrentSession();
  if (!session || session.role !== 'client') return null;

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_active')
    .eq('id', session.userId)
    .maybeSingle();
  if (profile?.is_active !== true) return null;

  return session;
}

export async function createTicketWithAttachmentsAction(
  subject: string,
  body: string,
  entries: Array<{ key: string; filename: string; mime: string; size_bytes: number }>
): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };

  // Validate attachments before creating ticket — fail whole batch before any insert
  if (entries && entries.length > 0) {
    if (entries.length > 10) {
      return { error: 'A ticket can have at most 10 attachments.' };
    }
    const prefix = `private/${session.userId}/`;
    for (const e of entries) {
      if (typeof e.key !== 'string' || !isPortalKey(e.key) || !e.key.startsWith(prefix)) {
        return { error: 'Attachment data is invalid. Please re-upload your files.' };
      }
      const keyExt = e.key.split('.').pop()?.toLowerCase() ?? '';
      if (!CONTACT_ALLOWED_EXT.includes(keyExt as (typeof CONTACT_ALLOWED_EXT)[number])) {
        return { error: 'Attachment data is invalid. Please re-upload your files.' };
      }
      if (
        typeof e.filename !== 'string' ||
        e.filename.trim().length < 1 ||
        e.filename.length > 255 ||
        typeof e.mime !== 'string' ||
        e.mime.length < 1 ||
        e.mime.length > 128 ||
        !Number.isFinite(e.size_bytes) ||
        e.size_bytes < 1 ||
        e.size_bytes > 10 * 1024 * 1024
      ) {
        return { error: 'Attachment data is invalid. Please re-upload your files.' };
      }
      const check = validateContactFile({ filename: e.filename, mime: e.mime, size: e.size_bytes });
      if (!check.ok) {
        return { error: 'Attachment data is invalid. Please re-upload your files.' };
      }
      if (check.ext !== keyExt) {
        return { error: 'Attachment data is invalid. Please re-upload your files.' };
      }
    }
  }

  const result = await createTicket(session.userId, subject, body);
  if (!result.ok) return { error: result.error };

  const ticketId = result.ticketId;

  if (entries && entries.length > 0) {
    const admin = getSupabaseAdmin();
    const { count, error: countError } = await admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', ticketId)
      .eq('kind', 'attachment');
    if (countError) return { error: `Count failed: ${countError.message}` };
    if ((count ?? 0) + entries.length > 10) {
      return { error: 'A ticket can have at most 10 attachments.' };
    }

    for (const e of entries) {
      const { error } = await admin.from('files').insert({
        bucket: 'private',
        r2_key: e.key,
        kind: 'attachment',
        ticket_id: ticketId,
        project_id: null,
        uploaded_by: session.userId,
        filename: e.filename,
        mime: e.mime,
        size_bytes: e.size_bytes,
      });
      if (error) return { error: `Could not save file: ${error.message}` };
    }
  }

  revalidatePath(`/portal/tickets/${ticketId}`);
  revalidatePath('/portal/tickets');
  revalidatePath('/portal');
  redirect(`/portal/tickets/${ticketId}`);
}

export async function clientReplyAction(
  ticketId: string,
  _prev: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };

  const result = await clientReply(ticketId, session.userId, String(formData.get('body') ?? ''));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/portal/tickets/${ticketId}`);
  revalidatePath('/portal/tickets');
  revalidatePath('/portal');
  return {};
}

export async function getTicketAttachmentPresignAction(input: {
  ticketId: string | null;
  filename: string;
  mime: string;
  size: number;
}): Promise<{ ok: true; key: string; uploadUrl: string } | { ok: false; error: string }> {
  const session = await requireClient();
  if (!session) return { ok: false, error: 'Unauthorized.' };

  const check = validateContactFile({ filename: input.filename, mime: input.mime, size: input.size });
  if (!check.ok) return { ok: false, error: check.error };

  const admin = getSupabaseAdmin();

  if (input.ticketId) {
    const { data: ticket, error } = await admin
      .from('tickets')
      .select('id, client_id')
      .eq('id', input.ticketId)
      .maybeSingle();

    if (error) return { ok: false, error: `Ticket lookup failed: ${error.message}` };
    if (!ticket || (ticket as { client_id: string }).client_id !== session.userId) {
      return { ok: false, error: 'Ticket not found.' };
    }

    const { count, error: countError } = await admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', input.ticketId)
      .eq('kind', 'attachment');

    if (countError) return { ok: false, error: `Count failed: ${countError.message}` };
    if ((count ?? 0) >= 10) {
      return { ok: false, error: 'A ticket can have at most 10 attachments.' };
    }

    let key: string;
    try {
      key = makeTicketAttachmentKey(session.userId, input.ticketId, check.ext);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }

    try {
      const uploadUrl = await presignPrivatePut(key, input.mime, 600);
      return { ok: true, key, uploadUrl };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  let key: string;
  try {
    key = makePendingAttachmentKey(session.userId, check.ext);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  try {
    const uploadUrl = await presignPrivatePut(key, input.mime, 600);
    return { ok: true, key, uploadUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function confirmTicketAttachmentAction(input: {
  ticketId: string | null;
  entries: Array<{ key: string; filename: string; mime: string; size_bytes: number }>;
}): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };

  if (!input.entries || input.entries.length === 0) return { error: 'No files provided.' };
  if (input.entries.length > 10) {
    return { error: 'A ticket can have at most 10 attachments.' };
  }

  if (input.ticketId) {
    const admin = getSupabaseAdmin();
    const { data: ticket } = await admin
      .from('tickets')
      .select('id, client_id')
      .eq('id', input.ticketId)
      .maybeSingle();
    if (!ticket || (ticket as { client_id: string }).client_id !== session.userId) {
      return { error: 'Ticket not found.' };
    }
    const { count, error: countError } = await admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', input.ticketId)
      .eq('kind', 'attachment');
    if (countError) return { error: `Count failed: ${countError.message}` };
    if ((count ?? 0) + input.entries.length > 10) {
      return { error: 'A ticket can have at most 10 attachments.' };
    }
  }

  // Validate all entries before any insert — defense against forged keys/metadata
  const prefix = `private/${session.userId}/`;
  for (const e of input.entries) {
    if (typeof e.key !== 'string' || !isPortalKey(e.key) || !e.key.startsWith(prefix)) {
      return { error: 'Attachment data is invalid. Please re-upload your files.' };
    }
    const keyExt = e.key.split('.').pop()?.toLowerCase() ?? '';
    if (!CONTACT_ALLOWED_EXT.includes(keyExt as (typeof CONTACT_ALLOWED_EXT)[number])) {
      return { error: 'Attachment data is invalid. Please re-upload your files.' };
    }
    if (
      typeof e.filename !== 'string' ||
      e.filename.trim().length < 1 ||
      e.filename.length > 255 ||
      typeof e.mime !== 'string' ||
      e.mime.length < 1 ||
      e.mime.length > 128 ||
      !Number.isFinite(e.size_bytes) ||
      e.size_bytes < 1 ||
      e.size_bytes > 10 * 1024 * 1024
    ) {
      return { error: 'Attachment data is invalid. Please re-upload your files.' };
    }
    const check = validateContactFile({ filename: e.filename, mime: e.mime, size: e.size_bytes });
    if (!check.ok) {
      return { error: 'Attachment data is invalid. Please re-upload your files.' };
    }
    if (check.ext !== keyExt) {
      return { error: 'Attachment data is invalid. Please re-upload your files.' };
    }
  }

  for (const e of input.entries) {
    const result = await createFileRow({
      bucket: 'private',
      r2_key: e.key,
      kind: 'attachment',
      ticket_id: input.ticketId ?? undefined,
      uploaded_by: session.userId,
      filename: e.filename,
      mime: e.mime,
      size_bytes: e.size_bytes,
    });
    if (!result.ok) return { error: result.error };
  }

  if (input.ticketId) {
    revalidatePath(`/portal/tickets/${input.ticketId}`);
    revalidatePath('/portal/tickets');
    revalidatePath('/portal');
  }

  return {};
}
