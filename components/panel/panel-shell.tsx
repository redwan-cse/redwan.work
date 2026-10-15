import { PanelNavigation } from './panel-navigation';

export interface PanelNavItem {
  label: string;
  href: string;
  enabled?: boolean;
}

export function PanelShell({
  title,
  userEmail,
  navItems,
  activeHref,
  children,
}: {
  title: string;
  userEmail: string;
  navItems: PanelNavItem[];
  /** Existing callers supply the workspace root, not the current route. */
  activeHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh min-w-0 flex-col bg-background md:flex-row">
      <a href="#portal-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:text-sm focus:ring-2 focus:ring-ring">
        Skip to workspace content
      </a>
      <PanelNavigation title={title} userEmail={userEmail} navItems={navItems} rootHref={activeHref} />
      <main id="portal-content" tabIndex={-1} className="min-w-0 flex-1 p-4 sm:p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}
