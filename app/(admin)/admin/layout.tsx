import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { PanelShell } from '@/components/panel/panel-shell';

export const metadata: Metadata = {
  title: 'Admin · redwan.work',
  robots: { index: false, follow: false },
};

const NAV = [
  { label: 'Overview', href: '/admin', enabled: true },
  { label: 'Clients', href: '/admin/clients', enabled: true },
  { label: 'Tickets', href: '/admin/tickets', enabled: true },
  { label: 'Projects', href: '/admin/projects', enabled: true },
  { label: 'Invoices', href: '/admin/invoices', enabled: true },
  { label: 'Assets', href: '/admin/assets', enabled: false },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/admin');
  if (session.role !== 'admin') redirect('/portal');

  return (
    <PanelShell
      title="redwan.work admin"
      userEmail={session.email}
      navItems={NAV}
      activeHref="/admin"
    >
      {children}
    </PanelShell>
  );
}
