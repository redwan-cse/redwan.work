import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { getClientPortalOverview } from '@/lib/crm/overview-queries';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PanelShell, type PanelNavItem } from '@/components/panel/panel-shell';
import { Toaster } from '@/components/ui/sonner';

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
  if (session.role !== 'client') {
    redirect(session.role === 'admin' ? '/admin' : '/login?next=/portal');
  }

  const admin = getSupabaseAdmin();
  const [overview, { data: recentNotifications }] = await Promise.all([
    getClientPortalOverview(session.userId),
    admin
      .from('notifications')
      .select('id, title, body, href, is_read, created_at')
      .eq('recipient_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  const navItems: PanelNavItem[] = [
    { label: 'Workspace Overview', shortLabel: 'Overview', href: '/portal', icon: 'dashboard' },
    { label: 'Order New Service', shortLabel: 'New Order', href: '/portal/orders/new', icon: 'store' },
    {
      label: 'Proposals',
      shortLabel: 'Proposals',
      href: '/portal/proposals',
      icon: 'proposals',
      badge: overview.pending_proposals ?? 0,
    },
    {
      label: 'My Orders & Projects',
      shortLabel: 'Orders',
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
    <>
      <PanelShell
        role="client"
        userEmail={session.email}
        userName={session.fullName}
        unreadNotifications={overview.unread_notifications ?? 0}
        recentNotifications={recentNotifications ?? []}
        navItems={navItems}
      >
        {children}
      </PanelShell>
      <Toaster
        richColors
        position="top-right"
        offset={{ top: '4.75rem', right: '1rem' }}
        mobileOffset={{ top: '4.75rem', right: '0.75rem', left: '0.75rem' }}
      />
    </>
  );
}
