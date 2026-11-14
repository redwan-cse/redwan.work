import { NextResponse } from 'next/server';
import { CEH_CERT_NUMBER, CEH_VERIFICATION_URL, SITE } from '@/lib/content/site';
import {
  getPublicPortfolioItems,
  getPublicServicesCatalog,
  getSiteSettingsAndResume,
} from '@/lib/cms/queries';
import { getBlogPostsPage, stripHtmlToPlainText } from '@/lib/blogger';
import {
  PUBLIC_FAQS,
  VERIFIED_RESEARCH_CITATIONS,
} from '@/lib/seo/structured-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [services, portfolio, { settings, items: resumeItems }, blogsPage] =
    await Promise.all([
      getPublicServicesCatalog(),
      getPublicPortfolioItems(),
      getSiteSettingsAndResume(),
      getBlogPostsPage(1, 10, 10),
    ]);

  const serviceSections = services.map((service) => {
    const pkgLines = service.packages.map((pkg) => {
      const usd = (pkg.priceCents / 100).toLocaleString('en-US');
      return `  - **${pkg.name}** (${pkg.tier}): $${usd} USD · ${pkg.deliveryDays}d delivery · ${pkg.depositPercent}% kickoff deposit · ${pkg.summary} Features: ${pkg.features.join('; ')}`;
    });

    return [
      `### ${service.title} (${service.pillarLabel})`,
      '',
      `${service.description}`,
      `- Rules of Engagement (RoE) required: ${service.requiresRoe ? 'Yes' : 'No'}`,
      `- Highlights: ${service.highlights.join('; ')}`,
      '- Packages:',
      ...pkgLines,
    ].join('\n');
  });

  const portfolioSections = portfolio.map((item) =>
    [
      `### ${item.title}`,
      `- Category: ${item.pillarLabel} · Outcome: ${item.headlineMetric}`,
      `- Summary: ${item.summary}`,
      item.challenge ? `- Challenge: ${item.challenge}` : '',
      item.approach.length ? `- Approach: ${item.approach.join(' | ')}` : '',
      item.outcomes.length ? `- Outcomes: ${item.outcomes.join(' | ')}` : '',
      item.stack.length ? `- Stack: ${item.stack.join(', ')}` : '',
      item.externalUrl ? `- Reference: ${item.externalUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );

  const experienceLines = resumeItems
    .filter((i) => i.section === 'experience')
    .map(
      (i) =>
        `- **${i.title}** at ${i.organization} (${i.period ?? 'Current'})${i.highlights.length ? ` — ${i.highlights.slice(0, 2).join(' ')}` : ''}`
    );

  const educationLines = resumeItems
    .filter((i) => i.section === 'education')
    .map((i) => `- **${i.title}**, ${i.organization} (${i.period ?? ''})`);

  const certLines = resumeItems
    .filter((i) => i.section === 'vendor_certification' || i.section === 'professional_certificate')
    .map(
      (i) =>
        `- **${i.title}** — ${i.organization}${i.period ? ` (${i.period})` : ''}${
          i.verification_url ? ` [Verify](${i.verification_url})` : ''
        }`
    );

  const faqSections = PUBLIC_FAQS.map(
    (faq) => `### ${faq.question}\n${faq.answer}`
  );

  const blogLines = blogsPage.posts.map((post) => {
    const excerpt = stripHtmlToPlainText(post.content).slice(0, 160);
    return `- [${post.title}](${post.url}) (${post.published.slice(0, 10)}): ${excerpt}...`;
  });

  const markdown = [
    `# ${settings.full_name} — Complete Technical Context (${SITE.url})`,
    '',
    `> ${settings.role_title}. ${settings.executive_summary}`,
    '',
    '## Verified Identity & Contact',
    '',
    `- Canonical URL: ${SITE.url}`,
    `- Email: ${SITE.email}`,
    `- Company: ${SITE.company.name} (${SITE.company.url})`,
    `- Location: ${settings.location}`,
    `- C|EH Verification (#${CEH_CERT_NUMBER}): ${CEH_VERIFICATION_URL}`,
    `- Technical Blog: https://blogs.redwan.work (${SITE.url}/blogs)`,
    `- GitHub: ${SITE.socials.github} · LinkedIn: ${SITE.socials.linkedin}`,
    '',
    '## Service Catalog & Packages',
    '',
    ...serviceSections,
    '',
    '## Case Studies & Engineering Portfolio',
    '',
    ...portfolioSections,
    '',
    '## Peer-Reviewed Publications',
    '',
    ...VERIFIED_RESEARCH_CITATIONS.map(
      (pub) =>
        `- **${pub.title}** — ${pub.venue} (${pub.publisher}, ${pub.quartile}, ${pub.datePublished}) · ${pub.url}`
    ),
    '',
    '## Experience, Education & Certifications',
    '',
    '### Professional Experience',
    ...experienceLines,
    '',
    '### Education',
    ...educationLines,
    '',
    '### Certifications',
    ...certLines,
    '',
    '## Frequently Asked Questions (AEO Reference)',
    '',
    ...faqSections,
    '',
    '## Latest Technical Dispatch Articles',
    '',
    ...blogLines,
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
