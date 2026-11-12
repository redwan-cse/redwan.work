import type { Metadata } from 'next';
import { getSiteSettingsAndResume } from '@/lib/cms/queries';
import { ResumeView } from '@/components/resume-view';
import { buildPublicMetadata } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Curriculum Vitae & Credentials — Md. Redwan Ahmed',
  description:
    'Interactive curriculum vitae and A4 printable resume for Md. Redwan Ahmed — Certified Ethical Hacker (C|EH, CCEP, CNSP, CAP), Full-Stack Engineer, Q1 Scopus & IEEE Researcher.',
  path: '/resume',
});

export default async function ResumePage() {
  const { settings, items } = await getSiteSettingsAndResume();
  return <ResumeView settings={settings} items={items} />;
}
