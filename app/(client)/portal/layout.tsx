import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PanelShell } from '@/components/panel/panel-shell';

export const metadata: Metadata = {
  title: 'Client portal · redwan.work',
  robots: { index: false, follow: false },
};

const NAV = [
  { label: 'Dashboard', href: '/portal', enabled: true },
  { label: 'Tickets', href: '/portal/tickets', enabled: true },
  { label: 'Files', href: '/portal/files', enabled: false },
  { label: 'Invoices', href: '/portal/invoices', enabled: false },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal');
  if (session.role === 'admin') redirect('/admin');
  if (session.role !== 'client') {
    redirect('/api/auth/logout?reason=deactivated');
  }

  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', session.userId)
    .maybeSingle();
  if (error) {
    console.error('profiles is_active check failed:', error.message);
  }
  if (profile?.is_active !== true) {
    redirect('/api/auth/logout?reason=deactivated');
  }

  return (
    <PanelShell
      title="Client portal"
      userEmail={session.email}
      navItems={NAV}
      activeHref="/portal"
    >
      {children}
    </PanelShell>
  );
}
