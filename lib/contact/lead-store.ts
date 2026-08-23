import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { NormalizedLead } from '@/lib/contact/lead-schema';

export async function insertLead(
  lead: NormalizedLead
): Promise<{ ok: true; ticketRef: string } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from('leads')
    .insert(lead)
    .select('ticket_number')
    .single();

  if (error || !data) {
    // Log shape, never PII values
    console.error('Lead insert failed:', error?.message ?? 'no row returned');
    return { ok: false, error: 'Could not save your message.' };
  }

  return { ok: true, ticketRef: `TKT-${data.ticket_number}` };
}
