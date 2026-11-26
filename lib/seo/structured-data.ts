import {
  CEH_CERT_NUMBER,
  CEH_VERIFICATION_URL,
  ORCID_ID,
  SITE,
  type PortfolioCaseStudy,
  type ServiceCatalogItem,
} from '@/lib/content/site';
import {
  stripHtmlToPlainText,
  type BlogPost,
} from '@/lib/blogger';
import type {
  ResumeItemRecord,
  SiteSettingsRecord,
} from '@/lib/cms/queries';

import { trySanitizeHttpUrl } from '@/lib/security/safe-redirect';

const SCHEMA_MONTH_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

/**
 * Normalize human-readable dates/ranges (e.g. "2024–2026", "Nov 2024")
 * into valid Schema.org ISO-8601 date strings ("2026", "2024-11").
 */
export function normalizeSchemaDate(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(trimmed)) {
    return trimmed;
  }
  const monthYear = trimmed.match(/\b([A-Za-z]{3,9})\s+(20\d{2})\b/);
  if (monthYear) {
    const mm = SCHEMA_MONTH_MAP[monthYear[1].toLowerCase()];
    if (mm) return `${monthYear[2]}-${mm}`;
  }
  const years = trimmed.match(/\b(19\d{2}|20\d{2})\b/g);
  return years ? years[years.length - 1] : undefined;
}

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export const PUBLIC_FAQS: ReadonlyArray<FaqEntry> = [
  {
    id: 'vapt-roe-process',
    question: 'How do penetration testing (VAPT) engagements and Rules of Engagement (RoE) work?',
    answer:
      'Every offensive security engagement starts with written authorization inside the Client Portal. Scope boundaries, authorized test targets, testing windows, and emergency escalation contacts are signed digitally under Rules of Engagement (RoE) before active OWASP and PTES testing begins.',
  },
  {
    id: 'full-stack-and-cloud',
    question: 'What full-stack engineering and cloud hardening services are available?',
    answer:
      'Md. Redwan Ahmed builds production Next.js, TypeScript, and Python applications with PostgreSQL Row Level Security (RLS), configures Ubuntu and CentOS servers, deploys Wazuh SIEM/XDR monitoring, and integrates Cloudflare R2 private storage and Turnstile protection.',
  },
  {
    id: 'packages-and-billing',
    question: 'How do fixed-scope packages, custom proposals, and billing work?',
    answer:
      'Clients can order a fixed-scope Starter, Standard, or Enterprise package directly or submit a custom scope on /contact to receive a versioned proposal (PRP-XXXX). Milestone invoices support USD, EUR, GBP, and BDT with clear kickoff deposits and acceptance sign-off.',
  },
  {
    id: 'deliverables-and-confidentiality',
    question: 'How are uploaded documents, source code, and security reports protected?',
    answer:
      'All attachments are stored in an isolated private Cloudflare R2 bucket without public URLs and audited via SHA-256 checksums in the Client Portal Deliverables Vault. Unconverted inquiry attachments are automatically purged after 90 days under v2 privacy controls.',
  },
  {
    id: 'verified-credentials-research',
    question: 'What credentials and peer-reviewed research back these services?',
    answer:
      'Md. Redwan Ahmed holds EC-Council Certified Ethical Hacker (C|EH #ECC8126370954), CCEP, CNSP, CAP, and GitHub Foundations credentials, leads Fast Cyber Defense, and published Q1 Scopus peer-reviewed machine learning research in Elsevier (DOI 10.1016/j.ijcce.2024.04.002).',
  },
];

export const VERIFIED_RESEARCH_CITATIONS = [
  {
    id: 'elsevier-ijcce-2024',
    title: 'Data-Driven Strategies for Digital Native Market Segmentation Using Clustering',
    venue: 'International Journal of Cognitive Computing in Engineering',
    publisher: 'Elsevier',
    quartile: 'Q1 (Scopus)',
    issn: '2666-3074',
    datePublished: '2024',
    url: 'https://doi.org/10.1016/j.ijcce.2024.04.002',
    description:
      'Peer-reviewed Q1 Scopus journal article on clustering and data-driven market segmentation.',
  },
  {
    id: 'ieee-cs-bdc-2024',
    title: 'Phishing URL Detection Using Comprehensive Feature Extraction and Machine Learning Techniques',
    venue: 'IEEE CS BDC SYMPOSIUM 2024',
    publisher: 'IEEE',
    quartile: 'Symposium Paper',
    datePublished: '2024-11-22',
    url: 'https://s24.ieeecsbdc.org/papers/156',
    description:
      'Peer-reviewed IEEE symposium paper evaluating URL feature extraction and ML models for phishing detection.',
  },
] as const;

export function buildRootSiteGraphJsonLd() {
  const personId = `${SITE.url}/#person`;
  const serviceId = `${SITE.url}/#service`;
  const websiteId = `${SITE.url}/#website`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: SITE.name,
        alternateName: [
          'Md Redwan Ahmed',
          'redwancse',
          'redwan.work',
          `${SITE.name} — Security & Engineering Consulting`,
        ],
        url: SITE.url,
        inLanguage: 'en-US',
        publisher: { '@id': personId },
      },
      {
        '@type': 'Person',
        '@id': personId,
        name: SITE.name,
        alternateName: ['Md Redwan Ahmed', 'redwancse'],
        description: SITE.tagline,
        url: SITE.url,
        image: `${SITE.url}${SITE.profileImage}`,
        jobTitle: SITE.role,
        email: `mailto:${SITE.email}`,
        telephone: SITE.phoneDisplay,
        identifier: [
          {
            '@type': 'PropertyValue',
            propertyID: 'ORCID',
            value: ORCID_ID,
            url: SITE.socials.orcid,
          },
        ],
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Dhaka',
          addressCountry: 'BD',
        },
        alumniOf: {
          '@type': 'CollegeOrUniversity',
          name: 'Jagannath University',
          sameAs: 'https://jnu.ac.bd',
        },
        worksFor: {
          '@type': 'Organization',
          name: SITE.company.name,
          url: SITE.company.url,
        },
        hasCredential: [
          {
            '@type': 'EducationalOccupationalCredential',
            name: 'Certified Ethical Hacker (C|EH)',
            credentialCategory: 'Professional Certification',
            recognizedBy: { '@type': 'Organization', name: 'EC-Council' },
            identifier: CEH_CERT_NUMBER,
            url: CEH_VERIFICATION_URL,
          },
          ...SITE.credentials
            .filter((cred) => cred.code !== 'C|EH' && cred.code !== 'Q1 Scopus')
            .map((cred) => ({
              '@type': 'EducationalOccupationalCredential',
              name: `${cred.code} — ${cred.label}`,
              credentialCategory: 'Certification',
            })),
        ],
        knowsAbout: [
          'Penetration Testing',
          'Vulnerability Assessment and Penetration Testing (VAPT)',
          'Active Directory and AD CS Security Hardening',
          'OSINT and Digital Fraud Investigation',
          'Wazuh SIEM and XDR Engineering',
          'Next.js and TypeScript Full-Stack Development',
          'PostgreSQL Row Level Security (RLS)',
          'Ubuntu and CentOS Linux Server Administration',
          'Applied Machine Learning and Phishing Detection',
        ],
        sameAs: [
          SITE.socials.github,
          SITE.socials.linkedin,
          SITE.socials.googleScholar,
          SITE.socials.orcid,
          SITE.socials.upwork,
          SITE.socials.fiverr,
          SITE.socials.twitter,
          SITE.socials.facebook,
          SITE.socials.instagram,
          'https://blogs.redwan.work',
        ],
      },
      {
        '@type': 'ProfessionalService',
        '@id': serviceId,
        name: `${SITE.name} — Security & Engineering Consulting`,
        description: SITE.tagline,
        url: SITE.url,
        image: `${SITE.url}${SITE.profileImage}`,
        founder: { '@id': personId },
        email: SITE.email,
        telephone: SITE.phoneDisplay,
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Dhaka',
          addressCountry: 'BD',
        },
        areaServed: 'Worldwide',
        sameAs: [SITE.company.url],
        serviceType: [
          'Penetration Testing & VAPT',
          'OSINT & Digital Fraud Investigation',
          'Wazuh SIEM & Linux Infrastructure Hardening',
          'Full-Stack Web & Client Portal Engineering',
          'Applied AI/ML & Incident Recovery',
        ],
      },
    ],
  };
}

export function buildBreadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.path === '/' ? SITE.url : `${SITE.url}${item.path}`,
    })),
  };
}

export function buildFaqPageJsonLd(faqs: ReadonlyArray<FaqEntry> = PUBLIC_FAQS) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function buildServicesOfferCatalogJsonLd(services: ServiceCatalogItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Cybersecurity, Full-Stack & Cloud Consulting Services — ${SITE.name}`,
    url: `${SITE.url}/services`,
    provider: { '@id': `${SITE.url}/#person` },
    areaServed: 'Worldwide',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Service Pillars & Packages',
      itemListElement: services.map((service, index) => ({
        '@type': 'Offer',
        position: index + 1,
        url: `${SITE.url}/services/${service.slug}`,
        priceCurrency: 'USD',
        price: (service.startingPriceCents / 100).toFixed(2),
        itemOffered: {
          '@type': 'Service',
          name: service.title,
          url: `${SITE.url}/services/${service.slug}`,
          serviceType: service.pillarLabel,
          description: service.tagline || service.description,
        },
      })),
    },
  };
}

export function buildServiceDetailJsonLd(service: ServiceCatalogItem) {
  const canonicalUrl = `${SITE.url}/services/${service.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${canonicalUrl}#service`,
    name: service.title,
    description: service.description || service.tagline,
    url: canonicalUrl,
    provider: { '@id': `${SITE.url}/#person` },
    areaServed: 'Worldwide',
    serviceType: service.pillarLabel,
    ...(service.packages.length > 0
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: `${service.title} Packages`,
            itemListElement: service.packages.map((pkg, idx) => ({
              '@type': 'Offer',
              position: idx + 1,
              name: pkg.name,
              description: pkg.summary,
              url: canonicalUrl,
              priceCurrency: 'USD',
              price: (pkg.priceCents / 100).toFixed(2),
            })),
          },
        }
      : {}),
  };
}

export function buildCaseStudyJsonLd(study: PortfolioCaseStudy & { slug?: string }) {
  const slug = study.slug || study.id;
  const canonicalUrl = `${SITE.url}/portfolio/${slug}`;
  const safeExternalUrl = trySanitizeHttpUrl(study.externalUrl);
  const isoDate = normalizeSchemaDate(study.year);
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    '@id': `${canonicalUrl}#case-study`,
    name: `${study.code}: ${study.title}`,
    description: study.summary,
    url: canonicalUrl,
    ...(isoDate ? { datePublished: isoDate } : {}),
    about: study.pillarLabel,
    author: { '@id': `${SITE.url}/#person` },
    creator: { '@id': `${SITE.url}/#person` },
    keywords: study.stack.join(', '),
    ...(safeExternalUrl ? { sameAs: safeExternalUrl } : {}),
  };
}

export function buildContactPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    '@id': `${SITE.url}/contact#contactpage`,
    name: `Contact & Project Inquiry — ${SITE.name}`,
    url: `${SITE.url}/contact`,
    mainEntity: { '@id': `${SITE.url}/#person` },
  };
}

function extractPublicationVenue(pub: ResumeItemRecord): string {
  for (const hl of pub.highlights ?? []) {
    const match = hl.match(/^(?:Journal|Conference|Venue):\s*(.+)$/i);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return pub.organization;
}

function extractPublicationDate(pub: ResumeItemRecord): string | undefined {
  const fromPeriod = normalizeSchemaDate(pub.period);
  if (fromPeriod) return fromPeriod;
  for (const hl of pub.highlights ?? []) {
    const match = hl.match(/^Date:\s*(.+)$/i);
    if (match?.[1]) {
      const parsed = normalizeSchemaDate(match[1]);
      if (parsed) return parsed;
    }
  }
  return undefined;
}

export function buildResumeProfileJsonLd(
  settings: SiteSettingsRecord,
  items: ResumeItemRecord[]
) {
  const publications = items.filter((item) => item.section === 'research');
  const scholarlyNodes = publications.map((pub, idx) => {
    const nodeId = `${SITE.url}/resume#publication-${idx + 1}`;
    const isoDate = extractPublicationDate(pub);
    return {
      '@type': 'ScholarlyArticle',
      '@id': nodeId,
      headline: pub.title,
      description: pub.description ?? undefined,
      ...(isoDate ? { datePublished: isoDate } : {}),
      url: pub.verification_url ?? `${SITE.url}/resume`,
      author: { '@id': `${SITE.url}/#person` },
      isPartOf: {
        '@type': 'PublicationIssue',
        name: extractPublicationVenue(pub),
      },
    };
  });

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        '@id': `${SITE.url}/resume#profilepage`,
        name: `Curriculum Vitae — ${settings.full_name}`,
        url: `${SITE.url}/resume`,
        mainEntity: { '@id': `${SITE.url}/#person` },
        hasPart: scholarlyNodes.map((node) => ({ '@id': node['@id'] })),
      },
      ...scholarlyNodes,
    ],
  };
}

export function buildPortfolioCollectionJsonLd(items: Array<PortfolioCaseStudy & { slug?: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE.url}/portfolio#collection`,
    name: `Selected Security, Software & Research Portfolio — ${SITE.name}`,
    url: `${SITE.url}/portfolio`,
    author: { '@id': `${SITE.url}/#person` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((item, idx) => {
        const slug = item.slug || item.id;
        const safeExternalUrl = trySanitizeHttpUrl(item.externalUrl);
        return {
          '@type': 'ListItem',
          position: idx + 1,
          item: {
            '@type': 'CreativeWork',
            name: item.title,
            description: item.summary,
            keywords: item.stack.join(', '),
            url: `${SITE.url}/portfolio/${slug}`,
            ...(safeExternalUrl ? { sameAs: safeExternalUrl } : {}),
            creator: { '@id': `${SITE.url}/#person` },
          },
        };
      }),
    },
  };
}

export function buildBlogsArchiveJsonLd(posts: BlogPost[], page: number) {
  const canonicalUrl = page > 1 ? `${SITE.url}/blogs?page=${page}` : `${SITE.url}/blogs`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${SITE.url}/blogs#blog`,
    name: `Security Research & Engineering Dispatch — ${SITE.name}`,
    url: canonicalUrl,
    sameAs: 'https://blogs.redwan.work',
    author: { '@id': `${SITE.url}/#person` },
    publisher: { '@id': `${SITE.url}/#person` },
    blogPost: posts.map((post) => {
      const inlineImg = post.content?.match(/<img[^>]+src="([^">]+)"/)?.[1];
      const imageUrl = post.imageUrl || inlineImg;
      return {
        '@type': 'BlogPosting',
        headline: post.title,
        url: post.url,
        datePublished: post.published,
        description: (post.excerpt ?? stripHtmlToPlainText(post.content)).slice(0, 180),
        ...(imageUrl ? { image: imageUrl } : {}),
        keywords: (post.labels ?? []).join(', '),
        author: { '@id': `${SITE.url}/#person` },
        publisher: { '@id': `${SITE.url}/#person` },
      };
    }),
  };
}
