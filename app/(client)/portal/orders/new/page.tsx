import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getPublicServicesCatalog } from '@/lib/cms/queries';
import { PortalOrderStoreClient } from '@/components/panel/portal-order-store-form';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function ClientPortalNewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{
    service?: string;
    package?: string;
    tier?: string;
    budget?: string;
    requirements?: string;
    quote_submitted?: string;
  }>;
}) {
  const params = await searchParams;
  const serviceParam = params.service || params.package;
  const session = await getCurrentSession();
  if (!session) {
    const qs = new URLSearchParams();
    if (serviceParam) qs.set('service', serviceParam);
    if (params.tier) qs.set('tier', params.tier);
    if (params.budget) qs.set('budget', params.budget);
    if (params.requirements) qs.set('requirements', params.requirements);
    const nextTarget = qs.toString()
      ? `/portal/orders/new?${qs.toString()}`
      : '/portal/orders/new';
    redirect(`/login?next=${encodeURIComponent(nextTarget)}`);
  }

  const catalog = await getPublicServicesCatalog();

  const selectedService =
    catalog.find((s) => s.slug === serviceParam) ?? catalog[0];
  const isCustomDefault = params.tier === 'custom';
  const isUnselectedDefault = params.tier === 'unselected';
  const selectedPkg =
    selectedService?.packages.find((p) => p.tier === params.tier) ??
    selectedService?.packages.find((p) => p.popular) ??
    selectedService?.packages[0];

  const defaultTierValue = isUnselectedDefault
    ? 'unselected'
    : isCustomDefault
      ? 'custom'
      : (selectedPkg?.tier ?? 'standard');

  return (
    <div className="space-y-8">
      {params.quote_submitted === '1' && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Custom Quote Request Submitted!</strong> Your requirements and target budget have been logged into the commercial pipeline. Expect a tailored proposal in your{' '}
            <Link href="/portal/proposals" className="font-semibold underline">
              Proposals tab
            </Link>{' '}
            shortly.
          </div>
        </div>
      )}
      <div>
        <Badge variant="outline" className="mb-2 font-mono text-xs">
          In-Portal Service Store &amp; Custom Deal Desk
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Order a Package or Offer a Custom Budget
        </h1>
        <p className="text-sm text-muted-foreground">
          Click any tier card or configure your own custom deal budget &amp; scope to launch an interactive contract workspace immediately.
        </p>
      </div>

      <PortalOrderStoreClient
        catalog={catalog}
        initialServiceSlug={selectedService?.slug ?? 'other-custom-engagement'}
        initialTier={defaultTierValue}
        initialBudget={params.budget ?? ''}
        initialRequirements={params.requirements ?? ''}
      />
    </div>
  );
}
