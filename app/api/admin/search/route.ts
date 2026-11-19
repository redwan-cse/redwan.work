import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

function escapeIlikePattern(raw: string): string {
  return raw
    .replace(/[,()*"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'Admin authorization required.' },
      { status: 403, headers: PRIVATE_NO_STORE }
    );
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const safeQuery = escapeIlikePattern(q.slice(0, 64));
  if (safeQuery.length < 2) {
    return NextResponse.json({ results: [] }, { headers: PRIVATE_NO_STORE });
  }

  const pattern = `%${safeQuery}%`;
  const admin = getSupabaseAdmin();

  const [
    { data: orders },
    { data: clients },
    { data: invoices },
    { data: tickets },
    { data: proposals },
    { data: inquiries },
  ] = await Promise.all([
    admin
      .from('orders')
      .select('id, code, title, status')
      .or(`code.ilike.${pattern},title.ilike.${pattern}`)
      .limit(5),
    admin
      .from('profiles')
      .select('id, full_name, email, company')
      .eq('role', 'client')
      .or(`full_name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern}`)
      .limit(5),
    admin
      .from('invoices')
      .select('id, code, currency, total_cents, status')
      .ilike('code', pattern)
      .limit(5),
    admin
      .from('tickets')
      .select('id, code, subject, status')
      .or(`code.ilike.${pattern},subject.ilike.${pattern}`)
      .limit(5),
    admin
      .from('proposals')
      .select('id, code, title, status')
      .or(`code.ilike.${pattern},title.ilike.${pattern}`)
      .limit(5),
    admin
      .from('inquiries')
      .select('id, code, name, email, company, status')
      .or(`code.ilike.${pattern},name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern}`)
      .limit(4),
  ]);

  const results = [
    ...(orders ?? []).map((o) => ({
      group: 'Orders',
      id: `order-${o.id}`,
      label: `${o.code}: ${o.title}`,
      meta: o.status.replace(/_/g, ' '),
      href: `/admin/orders/${o.id}`,
    })),
    ...(clients ?? []).map((c) => ({
      group: 'Clients',
      id: `client-${c.id}`,
      label: c.full_name || c.email,
      meta: [c.email, c.company].filter(Boolean).join(' · '),
      href: `/admin/clients/${c.id}`,
    })),
    ...(invoices ?? []).map((inv) => ({
      group: 'Invoices',
      id: `invoice-${inv.id}`,
      label: inv.code ?? inv.id,
      meta: `${inv.currency} ${(inv.total_cents / 100).toLocaleString()} · ${inv.status}`,
      href: `/admin/invoices/${inv.id}`,
    })),
    ...(tickets ?? []).map((t) => ({
      group: 'Tickets',
      id: `ticket-${t.id}`,
      label: `${t.code}: ${t.subject}`,
      meta: t.status.replace(/_/g, ' '),
      href: `/admin/tickets/${t.id}`,
    })),
    ...(proposals ?? []).map((p) => ({
      group: 'Proposals',
      id: `proposal-${p.id}`,
      label: `${p.code ?? 'Draft'}: ${p.title}`,
      meta: p.status,
      href: `/admin/proposals/${p.id}`,
    })),
    ...(inquiries ?? []).map((inq) => ({
      group: 'Inquiries',
      id: `inquiry-${inq.id}`,
      label: `${inq.code ? `${inq.code}: ` : ''}${inq.name} — ${inq.company || inq.email}`,
      meta: inq.status,
      href: `/admin/pipeline`,
    })),
  ];

  return NextResponse.json({ results }, { headers: PRIVATE_NO_STORE });
}
