import type { Metadata } from 'next';
import { SITE } from '@/lib/content/site';
import { MarketingFrame } from '@/components/marketing-frame';

// The resume page is a client component (react-to-print), so it cannot
// export metadata itself — this server layout provides it.
export const metadata: Metadata = {
  title: 'Resume',
  description: `Resume of ${SITE.name}, ${SITE.role}. Cybersecurity professional specializing in penetration testing, vulnerability assessments, and security consulting.`,
  alternates: { canonical: '/resume' },
  openGraph: {
    title: `Resume - ${SITE.name}`,
    description: `${SITE.name}, ${SITE.role} — cybersecurity resume.`,
    type: 'profile',
  },
};

export default function ResumeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingFrame>{children}</MarketingFrame>;
}
