import { NextResponse } from 'next/server';
import { CEH_CERT_NUMBER, CEH_VERIFICATION_URL, SITE } from '@/lib/content/site';
import {
  getPublicPortfolioItems,
  getPublicServicesCatalog,
} from '@/lib/cms/queries';
import { VERIFIED_RESEARCH_CITATIONS } from '@/lib/seo/structured-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [services, portfolio] = await Promise.all([
    getPublicServicesCatalog(),
    getPublicPortfolioItems(),
  ]);

  const serviceLines = services.map((service) => {
    const usd = Math.round(service.startingPriceCents / 100);
    return `- [${service.title}](${SITE.url}/services?pillar=${encodeURIComponent(
      service.pillar
    )}): ${service.tagline} Starting at $${usd.toLocaleString('en-US')} USD (${service.deliveryDaysMin}-${service.deliveryDaysMax} days).`;
  });

  const portfolioLines = portfolio.slice(0, 6).map(
    (item) =>
      `- [${item.title}](${SITE.url}/portfolio): ${item.summary}${
        item.headlineMetric ? ` Outcome: ${item.headlineMetric}.` : ''
      }`
  );

  const markdown = [
    `# ${SITE.name} — ${SITE.url.replace(/^https?:\/\//, '')}`,
    '',
    `> ${SITE.role}. ${SITE.tagline}`,
    '',
    '## Core Identity & Verification',
    '',
    `- Website: ${SITE.url}`,
    `- Full Context Dump: ${SITE.url}/llms-full.txt`,
    `- Contact Email: ${SITE.email}`,
    `- Organization: [${SITE.company.name}](${SITE.company.url})`,
    `- EC-Council Certified Ethical Hacker (C|EH #${CEH_CERT_NUMBER}): [Verify Official Badge](${CEH_VERIFICATION_URL})`,
    `- Technical Writing Archive: [blogs.redwan.work](https://blogs.redwan.work) (synced live at ${SITE.url}/blogs)`,
    `- GitHub: ${SITE.socials.github}`,
    `- LinkedIn: ${SITE.socials.linkedin}`,
    '',
    '## Service Pillars & Starting Packages',
    '',
    ...serviceLines,
    '',
    '## Peer-Reviewed Research',
    '',
    ...VERIFIED_RESEARCH_CITATIONS.map(
      (pub) =>
        `- [${pub.title}](${pub.url}): ${pub.venue} (${pub.publisher}, ${pub.quartile}, ${pub.datePublished}).`
    ),
    '',
    '## Selected Case Studies',
    '',
    ...portfolioLines,
    '',
    '## Key Public Endpoints',
    '',
    `- [Services & Fixed-Scope Packages](${SITE.url}/services): Pricing, deliverables, and FAQ across all 5 pillars.`,
    `- [Portfolio & Case Studies](${SITE.url}/portfolio): Production web platforms, VAPT, Wazuh SIEM, and applied AI.`,
    `- [Security & Engineering Blog](${SITE.url}/blogs): Live articles synced from blogs.redwan.work.`,
    `- [Curriculum Vitae](${SITE.url}/resume): Verified experience, education, certifications, and research.`,
    `- [Live Resume PDF](${SITE.url}/resume.pdf): Dynamically generated A4 PDF reflecting live CMS credentials and experience.`,
    `- [Start a Project / Contact](${SITE.url}/contact): Project scope intake with encrypted attachment vault.`,
    `- [Privacy Policy](${SITE.url}/privacy) · [Terms & RoE](${SITE.url}/tos)`,
    '',
  ].join('\n');

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
