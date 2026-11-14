import type { Metadata } from 'next';
import { getSiteSettingsAndResume } from '@/lib/cms/queries';
import { ResumeView } from '@/components/resume-view';
import { buildPublicMetadata, serializeJsonLd } from '@/lib/seo/metadata';
import {
  buildBreadcrumbJsonLd,
  buildResumeProfileJsonLd,
} from '@/lib/seo/structured-data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Curriculum Vitae & Credentials — Md. Redwan Ahmed',
  description:
    'Interactive curriculum vitae and A4 printable resume for Md. Redwan Ahmed — Certified Ethical Hacker (C|EH, CCEP, CNSP, CAP), Full-Stack Engineer & Q1 Scopus Researcher.',
  path: '/resume',
});

export default async function ResumePage() {
  const { settings, items } = await getSiteSettingsAndResume();
  const structuredData = [
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Curriculum Vitae', path: '/resume' },
    ]),
    buildResumeProfileJsonLd(settings, items),
  ];

  return (
    <>
      {structuredData.map((schema, index) => (
        <script
          key={`resume-schema-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
        />
      ))}
      <ResumeView settings={settings} items={items} />
    </>
  );
}
