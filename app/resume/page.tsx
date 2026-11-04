import type { Metadata } from 'next';
import { getSiteSettingsAndResume } from '@/lib/cms/queries';
import { ResumeView } from '@/components/resume-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Curriculum Vitae & Credentials — Md Redwan Ahmed (C|EH)',
  description:
    'Interactive curriculum vitae and A4 printable resume for Md Redwan Ahmed — Certified Ethical Hacker (C|EH), Full-Stack Engineer, Q1 Scopus & IEEE Researcher.',
  alternates: { canonical: '/resume' },
};

export default async function ResumePage() {
  const { settings, items } = await getSiteSettingsAndResume();
  return <ResumeView settings={settings} items={items} />;
}
