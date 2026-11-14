import {
  CEH_CERT_NUMBER,
  CEH_VERIFICATION_URL,
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
        name: `${SITE.name} — Security & Engineering Consulting`,
        url: SITE.url,
        inLanguage: 'en-US',
        publisher: { '@id': personId },
      },
      {
        '@type': 'Person',
        '@id': personId,
        name: SITE.name,
        alternateName: ['Md Redwan Ahmed', 'redwancse'],
        url: SITE.url,
        image: `${SITE.url}${SITE.profileImage}`,
        jobTitle: SITE.role,
        email: `mailto:${SITE.email}`,
        telephone: SITE.phoneDisplay,
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
          ...Object.values(SITE.socials),
          SITE.company.url,
          'https://blogs.redwan.work',
          VERIFIED_RESEARCH_CITATIONS[0].url,
          VERIFIED_RESEARCH_CITATIONS[1].url,
        ],
      },
      {
        '@type': 'ProfessionalService',
        '@id': serviceId,
        name: `${SITE.name} — Security & Engineering Consulting`,
        url: SITE.url,
        image: `${SITE.url}${SITE.profileImage}`,
        founder: { '@id': personId },
        email: SITE.email,
        telephone: SITE.phoneDisplay,
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
        url: `${SITE.url}/services?pillar=${encodeURIComponent(service.pillar)}`,
        priceCurrency: 'USD',
        price: (service.startingPriceCents / 100).toFixed(2),
        itemOffered: {
          '@type': 'Service',
          name: service.title,
          serviceType: service.pillarLabel,
          description: service.tagline || service.description,
        },
      })),
    },
  };
}

export function buildResumeProfileJsonLd(
  settings: SiteSettingsRecord,
  items: ResumeItemRecord[]
) {
  const publications = items.filter((item) => item.section === 'research');
  const scholarlyNodes = publications.map((pub) => ({
    '@type': 'ScholarlyArticle',
    headline: pub.title,
    description: pub.description ?? undefined,
    datePublished: pub.period ?? '2024',
    url: pub.verification_url ?? `${SITE.url}/resume`,
    author: { '@id': `${SITE.url}/#person` },
    isPartOf: {
      '@type': 'PublicationIssue',
      name: pub.organization,
    },
  }));

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        name: `Curriculum Vitae — ${settings.full_name}`,
        url: `${SITE.url}/resume`,
        mainEntity: { '@id': `${SITE.url}/#person` },
        hasPart: scholarlyNodes,
      },
      ...scholarlyNodes,
    ],
  };
}

export function buildPortfolioCollectionJsonLd(items: PortfolioCaseStudy[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Selected Security, Software & Research Portfolio — ${SITE.name}`,
    url: `${SITE.url}/portfolio`,
    author: { '@id': `${SITE.url}/#person` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((item, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        item: {
          '@type': 'CreativeWork',
          name: item.title,
          description: item.summary,
          keywords: item.stack.join(', '),
          url: item.externalUrl || `${SITE.url}/portfolio`,
          creator: { '@id': `${SITE.url}/#person` },
        },
      })),
    },
  };
}

export function buildBlogsArchiveJsonLd(posts: BlogPost[], page: number) {
  const canonicalUrl = page > 1 ? `${SITE.url}/blogs?page=${page}` : `${SITE.url}/blogs`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `Security Research & Engineering Dispatch — ${SITE.name}`,
    url: canonicalUrl,
    sameAs: 'https://blogs.redwan.work',
    author: { '@id': `${SITE.url}/#person` },
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: post.url,
      datePublished: post.published,
      description: stripHtmlToPlainText(post.content).slice(0, 180),
      keywords: (post.labels ?? []).join(', '),
      author: { '@id': `${SITE.url}/#person` },
    })),
  };
}
