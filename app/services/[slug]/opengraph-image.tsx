import { ImageResponse } from 'next/og';
import { getPublicServicesCatalog } from '@/lib/cms/queries';
import { SITE } from '@/lib/content/site';

export const alt = `Service Package — ${SITE.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function ServiceOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const services = await getPublicServicesCatalog();
  const service = services.find((s) => s.slug === slug);

  const title = service?.title ?? 'Security & Engineering Consulting Services';
  const pillar = service?.pillarLabel ?? 'Fixed-Scope Consulting Packages';
  const tagline =
    service?.tagline ??
    'Offensive security assessments, full-stack platforms, cloud hardening, and incident recovery.';
  const startUsd = service
    ? `$${Math.round(service.startingPriceCents / 100).toLocaleString('en-US')} USD`
    : 'Transparent Fixed-Scope Tiers';
  const delivery = service
    ? `${service.deliveryDaysMin}–${service.deliveryDaysMax} days turnaround`
    : 'Dedicated Client Portal';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 68px',
          background: 'linear-gradient(135deg, #0b182c 0%, #102542 55%, #1b3b66 100%)',
          color: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              padding: '10px 20px',
              borderRadius: '999px',
              border: '1px solid rgba(147, 197, 253, 0.35)',
              background: 'rgba(30, 58, 138, 0.4)',
              fontSize: 20,
              fontWeight: 700,
              color: '#93c5fd',
            }}
          >
            {pillar}
          </div>
          <div style={{ fontSize: 20, color: '#cbd5e1', fontWeight: 600 }}>
            {`${SITE.name} · redwan.work`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1020px' }}>
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
              color: '#ffffff',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 26, color: '#cbd5e1', lineHeight: 1.4 }}>{tagline}</div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(148, 163, 184, 0.25)',
            paddingTop: '24px',
          }}
        >
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                background: '#2563eb',
                fontSize: 22,
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              {`From ${startUsd}`}
            </div>
            <div
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                fontSize: 20,
                color: '#e2e8f0',
              }}
            >
              {delivery}
            </div>
          </div>
          <div style={{ fontSize: 19, color: '#94a3b8', fontWeight: 600 }}>
            C|EH · CCEP · CNSP · CAP
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
