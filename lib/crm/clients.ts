import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { crmError, type CrmResult } from '@/lib/crm/result';
import { findAuthUserByEmail } from '@/lib/crm/auth-admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface ClientRow {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  is_active: boolean;
  created_at: string;
}

export async function listClients(): Promise<ClientRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, company, is_active, created_at')
    .eq('role', 'client')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`clients query failed: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string;
    full_name: string | null;
    company: string | null;
    is_active: boolean;
    created_at: string;
  }>;

  const items: ClientRow[] = [];
  for (const row of rows) {
    const { data: userData } = await admin.auth.admin.getUserById(row.id);
    items.push({
      id: row.id,
      email: userData?.user?.email ?? '',
      full_name: row.full_name,
      company: row.company,
      is_active: row.is_active,
      created_at: row.created_at,
    });
  }
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function setClaimRole(userId: string, role: 'admin' | 'client'): Promise<CrmResult> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return crmError('Auth user lookup failed.');
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...(data.user.app_metadata ?? {}), role },
  });
  if (updErr) return crmError(`Setting role claim failed: ${updErr.message}`);
  const { error: signOutErr } = await admin.auth.admin.signOut(userId);
  if (signOutErr) return crmError('Session revocation failed.');
  return { ok: true };
}

export async function inviteClient(input: {
  email: string;
  fullName?: string;
  company?: string;
  redirectToBase: string;
}): Promise<CrmResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return crmError('Enter a valid email address.');

  const admin = getSupabaseAdmin();
  const existing = await findAuthUserByEmail(email);
  if (existing?.role === 'client') return crmError('That email is already a client.');

  let userId: string;
  if (existing) {
    userId = existing.id;
    const claimed = await setClaimRole(userId, 'client');
    if (!claimed.ok) return claimed;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${input.redirectToBase}/invite/accept`,
    });
    if (error || !data?.user) return crmError(`Invite failed: ${error?.message ?? 'no user returned'}`);
    userId = data.user.id;
    const claimed = await setClaimRole(userId, 'client');
    if (!claimed.ok) return claimed;
  }

  const profile: Record<string, unknown> = { id: userId, role: 'client' };
  if (input.fullName?.trim()) profile.full_name = input.fullName.trim();
  if (input.company?.trim()) profile.company = input.company.trim();

  const { error: profileErr } = await admin.from('profiles').upsert(profile, { onConflict: 'id' });
  if (profileErr) return crmError(`Profile save failed: ${profileErr.message}`);

  return { ok: true };
}

export async function setClientActive(clientId: string, active: boolean): Promise<CrmResult> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('profiles')
    .update({ is_active: active })
    .eq('id', clientId)
    .eq('role', 'client');
  if (error) return crmError(`Update failed: ${error.message}`);

  if (!active) {
    const { error: signOutErr } = await admin.auth.admin.signOut(clientId);
    if (signOutErr) return crmError('Session revocation failed.');
  }

  return { ok: true };
}

export async function convertLead(leadId: string, redirectToBase: string): Promise<CrmResult> {
  const admin = getSupabaseAdmin();

  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('id, email, name, company, converted_client_id')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) return crmError(`Lead lookup failed: ${leadErr.message}`);
  if (!lead) return crmError('Lead not found.');
  if (lead.converted_client_id) return crmError('This lead was already converted.');

  const email = String(lead.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return crmError('Lead has no usable email address.');

  const existing = await findAuthUserByEmail(email);
  if (existing?.role === 'admin') return crmError('That email belongs to an admin account.');

  let userId: string;
  const freshAccount = !existing;
  if (existing) {
    userId = existing.id;
    const claimed = await setClaimRole(userId, 'client');
    if (!claimed.ok) return claimed;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${redirectToBase}/invite/accept`,
    });
    if (error || !data?.user) return crmError(`Invite failed: ${error?.message ?? 'no user returned'}`);
    userId = data.user.id;
    const claimed = await setClaimRole(userId, 'client');
    if (!claimed.ok) return claimed;
  }

  const profile: Record<string, unknown> = { id: userId, role: 'client' };
  if (freshAccount && typeof lead.name === 'string' && lead.name.trim()) {
    profile.full_name = lead.name.trim();
  }
  if (freshAccount && typeof lead.company === 'string' && lead.company.trim()) {
    profile.company = lead.company.trim();
  }
  const { error: profileErr } = await admin.from('profiles').upsert(profile, { onConflict: 'id' });
  if (profileErr) return crmError(`Profile save failed: ${profileErr.message}`);

  const { error: leadUpdErr } = await admin
    .from('leads')
    .update({ converted_client_id: userId, status: 'won' })
    .eq('id', leadId);
  if (leadUpdErr) return crmError(`Lead update failed: ${leadUpdErr.message}`);

  return { ok: true };
}
