import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PanelShell, type PanelNavItem } from '@/components/panel/panel-shell';

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
  const { data: metricsRaw } = await admin.rpc('admin_command_center_metrics');
  const metrics = (metricsRaw ?? {}) as Record<string, number>;

  const navItems: PanelNavItem[] = [
    { label: 'Command Overview', href: '/admin', icon: 'dashboard' },
    {
      label: 'Inquiries & Leads',
      href: '/admin/inquiries',
      icon: 'inquiries',
      badge: metrics.new_inquiries ?? 0,
    },
    { label: 'Proposals', href: '/admin/proposals', icon: 'proposals' },
    {
      label: 'Orders & Delivery',
      href: '/admin/orders',
      icon: 'orders',
      badge: metrics.active_orders ?? 0,
    },
    { label: 'Clients 360° CRM', href: '/admin/clients', icon: 'clients' },
    {
      label: 'Invoices & Payments',
      href: '/admin/invoices',
      icon: 'invoices',
      badge: metrics.submitted_payments ?? 0,
    },
    {
      label: 'Support Tickets',
      href: '/admin/tickets',
      icon: 'tickets',
      badge: metrics.open_tickets ?? 0,
    },
    {
      label: 'Monthly Retainers',
      href: '/admin/retainers',
      icon: 'retainers',
      badge: metrics.active_retainers ?? 0,
    },
    { label: 'Client Reviews', href: '/admin/reviews', icon: 'reviews' },
    { label: 'Services & Packages CMS', href: '/admin/services', icon: 'services' },
    { label: 'Portfolio CMS', href: '/admin/portfolio', icon: 'deliverables' },
    { label: 'Resume & Profile CMS', href: '/admin/resume', icon: 'profile' },
    { label: 'Audit & Security Log', href: '/admin/audit', icon: 'audit' },
  ];

  return (
    <PanelShell
      role="admin"
      userEmail={session.email}
      userName={session.fullName}
      unreadNotifications={metrics.unread_notifications ?? 0}
      navItems={navItems}
    >
      {children}
    </PanelShell>
  );
}
