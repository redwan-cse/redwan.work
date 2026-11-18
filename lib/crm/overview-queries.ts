import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function fetchAdminMetrics(): Promise<Record<string, number>> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.rpc('admin_command_center_metrics');
  return (data ?? {}) as Record<string, number>;
}

const cachedFetchAdminMetrics =
  typeof cache === 'function' ? cache(fetchAdminMetrics) : fetchAdminMetrics;

export function getAdminCommandCenterMetrics(): Promise<Record<string, number>> {
  return cachedFetchAdminMetrics();
}

async function fetchClientPortalOverview(clientId: string): Promise<Record<string, number>> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.rpc('client_portal_overview', {
    p_client_id: clientId,
  });
  return (data ?? {}) as Record<string, number>;
}

const cachedFetchClientPortalOverview =
  typeof cache === 'function' ? cache(fetchClientPortalOverview) : fetchClientPortalOverview;

export function getClientPortalOverview(clientId: string): Promise<Record<string, number>> {
  return cachedFetchClientPortalOverview(clientId);
}
