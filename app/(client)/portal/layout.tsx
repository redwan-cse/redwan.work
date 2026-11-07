import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PanelShell, type PanelNavItem } from '@/components/panel/panel-shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Client Portal',
  robots: { index: false, follow: false },
};

export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect('/login?next=/portal');
  }

  const admin = getSupabaseAdmin();
  const { data: overviewRaw } = await admin.rpc('client_portal_overview', {
    p_client_id: session.userId,
  });
  const overview = (overviewRaw ?? {}) as Record<string, number>;

  const navItems: PanelNavItem[] = [
    { label: 'Workspace Overview', href: '/portal', icon: 'dashboard' },
    { label: 'Order New Service', href: '/portal/orders/new', icon: 'store' },
    {
      label: 'Proposals',
      href: '/portal/proposals',
      icon: 'proposals',
      badge: overview.pending_proposals ?? 0,
    },
    {
      label: 'My Orders & Projects',
      href: '/portal/orders',
      icon: 'orders',
      badge: overview.active_orders ?? 0,
    },
    {
      label: 'Deliverables Vault',
      href: '/portal/files',
      icon: 'files',
      badge: overview.awaiting_review_deliverables ?? 0,
    },
    {
      label: 'Invoices & Billing',
      href: '/portal/invoices',
      icon: 'invoices',
      badge: overview.unpaid_invoices ?? 0,
    },
    {
      label: 'Support Helpdesk',
      href: '/portal/tickets',
      icon: 'tickets',
      badge: overview.open_tickets ?? 0,
    },
    {
      label: 'Monthly Retainers',
      href: '/portal/retainers',
      icon: 'retainers',
      badge: overview.active_retainers ?? 0,
    },
    { label: 'Account & Profile', href: '/portal/profile', icon: 'profile' },
  ];

  return (
    <PanelShell
      role="client"
      userEmail={session.email}
      userName={session.fullName}
      unreadNotifications={overview.unread_notifications ?? 0}
      navItems={navItems}
    >
      {children}
    </PanelShell>
  );
}
