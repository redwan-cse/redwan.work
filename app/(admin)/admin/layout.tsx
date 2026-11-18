import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { getAdminCommandCenterMetrics } from '@/lib/crm/overview-queries';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PanelShell, type PanelNavItem } from '@/components/panel/panel-shell';
import { AdminCommandPalette } from '@/components/admin/admin-command-palette';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Command Center',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect('/login?next=/admin');
  }
  if (session.role !== 'admin') {
    redirect('/portal');
  }

  const admin = getSupabaseAdmin();
  const [metrics, { data: recentNotifications }] = await Promise.all([
    getAdminCommandCenterMetrics(),
    admin
      .from('notifications')
      .select('id, title, body, href, is_read, created_at')
      .eq('recipient_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  const navItems: PanelNavItem[] = [
    { label: 'Overview', href: '/admin', icon: 'dashboard' },
    {
      label: 'Pipeline & Proposals',
      href: '/admin/pipeline',
      icon: 'pipeline',
      badge: metrics.new_inquiries ?? 0,
      activePrefixes: ['/admin/inquiries', '/admin/proposals'],
    },
    {
      label: 'Orders & Delivery',
      href: '/admin/orders',
      icon: 'orders',
      badge: metrics.active_orders ?? 0,
    },
    { label: 'Clients 360°', href: '/admin/clients', icon: 'clients' },
    {
      label: 'Billing & Retainers',
      href: '/admin/billing',
      icon: 'billing',
      badge: metrics.submitted_payments ?? 0,
      activePrefixes: ['/admin/invoices', '/admin/retainers'],
    },
    {
      label: 'Support & Reviews',
      href: '/admin/support',
      icon: 'support',
      badge: metrics.open_tickets ?? 0,
      activePrefixes: ['/admin/tickets', '/admin/reviews'],
    },
    {
      label: 'Content Studio',
      href: '/admin/content',
      icon: 'content',
      activePrefixes: ['/admin/services', '/admin/portfolio', '/admin/resume', '/admin/assets', '/admin/blogs'],
    },
    {
      label: 'Security & Ops',
      href: '/admin/ops',
      icon: 'ops',
      activePrefixes: ['/admin/audit', '/admin/emails', '/admin/recovery', '/admin/settings'],
    },
  ];

  return (
    <PanelShell
      role="admin"
      userEmail={session.email}
      userName={session.fullName}
      unreadNotifications={metrics.unread_notifications ?? 0}
      recentNotifications={recentNotifications ?? []}
      navItems={navItems}
      headerSlot={<AdminCommandPalette />}
    >
      {children}
    </PanelShell>
  );
}
