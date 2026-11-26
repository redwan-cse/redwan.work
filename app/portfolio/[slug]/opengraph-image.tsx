import { ImageResponse } from 'next/og';
import { getPublicPortfolioItems } from '@/lib/cms/queries';
import { SITE } from '@/lib/content/site';

export const alt = `Case Study — ${SITE.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function PortfolioOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const items = await getPublicPortfolioItems();
  const study = items.find((i) => i.slug === slug);

  const code = study?.code ?? 'CASE STUDY';
  const title = study?.title ?? 'Security & Software Engineering Portfolio';
  const metric = study?.headlineMetric ?? 'Verified Engineering & Security Delivery';
  const sector = study ? `${study.clientSector} · ${study.year}` : SITE.shortRole;
  const stack = (study?.stack ?? ['Next.js', 'OWASP', 'PostgreSQL', 'Linux']).slice(0, 5);

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
          background: 'linear-gradient(135deg, #0b182c 0%, #102542 55%, #17345a 100%)',
          color: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div
              style={{
                padding: '8px 18px',
                borderRadius: '999px',
                background: '#2563eb',
                fontSize: 20,
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              {code}
            </div>
            <div style={{ fontSize: 20, color: '#cbd5e1', fontWeight: 500 }}>{sector}</div>
          </div>
          <div style={{ fontSize: 20, color: '#93c5fd', fontWeight: 600 }}>
            {`${SITE.name} · redwan.work`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1040px' }}>
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: '-0.025em',
              color: '#ffffff',
            }}
          >
            {title}
          </div>
          <div
            style={{
              padding: '14px 22px',
              borderRadius: '12px',
              border: '1px solid rgba(147, 197, 253, 0.35)',
              background: 'rgba(30, 58, 138, 0.35)',
              fontSize: 24,
              fontWeight: 600,
              color: '#bfdbfe',
            }}
          >
            {metric}
          </div>
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
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {stack.map((tech) => (
              <div
                key={tech}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: 'rgba(15, 23, 42, 0.55)',
                  fontSize: 17,
                  fontWeight: 600,
                  color: '#e2e8f0',
                }}
              >
                {tech}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 19, color: '#94a3b8', fontWeight: 600 }}>
            Case Study · redwan.work
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
