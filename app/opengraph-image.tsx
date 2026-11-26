import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/content/site';

export const alt = `${SITE.name} — ${SITE.shortRole}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
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
          background: 'linear-gradient(135deg, #0b182c 0%, #102542 52%, #17345a 100%)',
          color: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 20px',
              borderRadius: '999px',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 42, 74, 0.65)',
              fontSize: 20,
              fontWeight: 600,
              color: '#93c5fd',
              letterSpacing: '0.04em',
            }}
          >
            <span>REDWAN.WORK</span>
            <span style={{ color: '#64748b' }}>·</span>
            <span style={{ color: '#e2e8f0' }}>OFFENSIVE SECURITY &amp; ENGINEERING</span>
          </div>
          <div
            style={{
              fontSize: 18,
              color: '#cbd5e1',
              fontWeight: 500,
            }}
          >
            {`Founder & CEO · ${SITE.company.name}`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1020px' }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              color: '#ffffff',
            }}
          >
            {SITE.name}
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: '#93c5fd',
              lineHeight: 1.3,
            }}
          >
            {SITE.shortRole}
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#cbd5e1',
              lineHeight: 1.45,
            }}
          >
            Penetration Testing (VAPT) · Full-Stack Next.js Platforms · Wazuh SIEM &amp; Linux Hardening · Applied AI/ML
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
          <div style={{ display: 'flex', gap: '12px' }}>
            {['C|EH', 'CCEP', 'CNSP', 'CAP', 'Q1 Scopus'].map((badge) => (
              <div
                key={badge}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(147, 197, 253, 0.3)',
                  background: 'rgba(30, 58, 138, 0.35)',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#e0f2fe',
                }}
              >
                {badge}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#94a3b8' }}>
            https://redwan.work
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
