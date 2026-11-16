import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin authorization required.' }, { status: 403 });
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const pattern = `%${escapeIlikePattern(q.slice(0, 64))}%`;
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
      .select('id, name, email, subject, status')
      .or(`name.ilike.${pattern},email.ilike.${pattern},subject.ilike.${pattern}`)
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
      href: `/admin/proposals`,
    })),
    ...(inquiries ?? []).map((inq) => ({
      group: 'Inquiries',
      id: `inquiry-${inq.id}`,
      label: `${inq.name} — ${inq.subject || inq.email}`,
      meta: inq.status,
      href: `/admin/pipeline`,
    })),
  ];

  return NextResponse.json({ results });
}
