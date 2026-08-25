import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface LeadSummaryRow {
  id: string;
  number: number;
  name: string;
  company: string | null;
  email: string;
  status: string;
  converted_client_id: string | null;
  created_at: string;
}

export async function listRecentLeads(limit = 5): Promise<LeadSummaryRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('leads')
    .select('id, ticket_number, name, company, email, status, converted_client_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`recent leads query failed: ${error.message}`);
  return ((data ?? []) as unknown as Array<{
    id: string;
    ticket_number: number;
    name: string;
    company: string | null;
    email: string;
    status: string;
    converted_client_id: string | null;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    number: row.ticket_number,
    name: row.name,
    company: row.company,
    email: row.email,
    status: row.status,
    converted_client_id: row.converted_client_id,
    created_at: row.created_at,
  }));
}
