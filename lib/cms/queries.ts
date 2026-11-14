import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  CEH_VERIFICATION_URL,
  PORTFOLIO_ITEMS,
  SERVICE_CATALOG,
  SERVICE_PILLARS,
  SITE,
  type PortfolioCaseStudy,
  type ServiceCatalogItem,
  type ServicePackageSeed,
  type ServicePillarKey,
} from '@/lib/content/site';

export interface ResumeItemRecord {
  id: string;
  section:
    | 'experience'
    | 'leadership'
    | 'education'
    | 'vendor_certification'
    | 'professional_certificate'
    | 'research';
  title: string;
  organization: string;
  role_type: string | null;
  location: string | null;
  period: string | null;
  description: string | null;
  highlights: string[];
  verification_url: string | null;
  badge_label: string | null;
  sort_order: number;
  is_visible: boolean;
}

export interface SiteSettingsRecord {
  id: string;
  full_name: string;
  role_title: string;
  short_role: string;
  subtitle: string;
  tagline: string;
  executive_summary: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  location: string;
  cal_com_url: string;
  company_name: string;
  company_url: string;
  linkedin_url: string;
  github_url: string;
  website_url: string;
  resume_pdf_url: string;
  credentials: Array<{ code: string; label: string }>;
  research_interests: string[];
  technical_skills: Record<string, string[]>;
  soft_skills: string[];
  other_skills: string[];
  hobbies: Array<{ name: string; description: string }>;
  references_list: Array<{
    name: string;
    title: string;
    institution: string;
    email: string;
    phone: string;
  }>;
}

export async function getPublicServicesCatalog(options?: {
  includeHidden?: boolean;
}): Promise<
  Array<
    ServiceCatalogItem & {
      id: string;
      isPublic: boolean;
      isFeatured: boolean;
      sortOrder: number;
      rawPackages: Array<{
        id: string;
        tier_name: string;
        package_name: string;
        summary: string;
        price_cents: number;
        currency: string;
        deposit_percent: number;
        delivery_days: number;
        revisions_included: number;
        is_popular: boolean;
        is_active: boolean;
        features: string[];
      }>;
    }
  >
> {
  try {
    const admin = getSupabaseAdmin();
    let query = admin
      .from('services')
      .select('*, service_packages(*)')
      .order('sort_order', { ascending: true });

    if (!options?.includeHidden) {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      return SERVICE_CATALOG.map((item, idx) => ({
        ...item,
        id: item.slug,
        isPublic: true,
        isFeatured: true,
        sortOrder: (idx + 1) * 10,
        rawPackages: item.packages.map((p) => ({
          id: `${item.slug}-${p.tier}`,
          tier_name:
            p.tier === 'starter'
              ? 'Starter'
              : p.tier === 'standard'
                ? 'Standard'
                : 'Enterprise',
          package_name: p.name,
          summary: p.summary,
          price_cents: p.priceCents,
          currency: 'USD',
          deposit_percent: p.depositPercent,
          delivery_days: p.deliveryDays,
          revisions_included: p.revisions,
          is_popular: Boolean(p.popular),
          is_active: true,
          features: p.features,
        })),
      }));
    }

    return data.map((row) => {
      const pillar = (row.pillar as ServicePillarKey) || 'cybersecurity';
      const pillarMeta = SERVICE_PILLARS[pillar] ?? SERVICE_PILLARS.cybersecurity;
      interface RawPkgRow {
        id: string;
        tier_name: string;
        package_name?: string | null;
        summary: string;
        price_cents: number;
        currency: string;
        deposit_percent: number;
        delivery_days: number;
        revisions_included: number;
        is_popular?: boolean | null;
        is_active?: boolean | null;
        sort_order?: number | null;
        features?: unknown;
      }
      const rawPkgs: RawPkgRow[] = (
        Array.isArray(row.service_packages) ? (row.service_packages as RawPkgRow[]) : []
      )
        .filter((p: RawPkgRow) => options?.includeHidden || p.is_active !== false)
        .sort((a: RawPkgRow, b: RawPkgRow) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      const packages: ServicePackageSeed[] = rawPkgs.map((pkg: RawPkgRow) => {
        const tierLower = String(pkg.tier_name || 'Standard').toLowerCase();
        const tier: 'starter' | 'standard' | 'enterprise' =
          tierLower === 'starter'
            ? 'starter'
            : tierLower === 'enterprise'
              ? 'enterprise'
              : 'standard';

        const features = Array.isArray(pkg.features)
          ? pkg.features.map((f: unknown) => String(f))
          : [];

        return {
          tier,
          name: pkg.package_name || `${pkg.tier_name} Package`,
          priceCents: pkg.price_cents ?? 0,
          deliveryDays: pkg.delivery_days ?? 7,
          revisions: pkg.revisions_included ?? 2,
          depositPercent: pkg.deposit_percent ?? 50,
          popular: Boolean(pkg.is_popular || pkg.tier_name === 'Standard'),
          summary: pkg.summary ?? '',
          features,
        };
      });

      const minPrice =
        packages.length > 0
          ? Math.min(...packages.map((p) => p.priceCents))
          : row.starting_price_cents || 8000;
      const minDays =
        packages.length > 0
          ? Math.min(...packages.map((p) => p.deliveryDays))
          : row.delivery_days_min || 3;
      const maxDays =
        packages.length > 0
          ? Math.max(...packages.map((p) => p.deliveryDays))
          : row.delivery_days_max || 14;

      return {
        id: row.id,
        slug: row.slug,
        pillar,
        pillarLabel: pillarMeta.label,
        title: row.title,
        tagline: row.tagline,
        description: row.description,
        requiresRoe: Boolean(row.requires_roe),
        startingPriceCents: minPrice,
        deliveryDaysMin: row.delivery_days_min || minDays,
        deliveryDaysMax: row.delivery_days_max || maxDays,
        highlights:
          Array.isArray(row.highlights) && row.highlights.length > 0
            ? row.highlights
            : Array.isArray(row.tools_tags)
              ? row.tools_tags
              : [],
        packages,
        isPublic: Boolean(row.is_public),
        isFeatured: Boolean(row.is_featured),
        sortOrder: row.sort_order ?? 0,
        rawPackages: rawPkgs.map((p: RawPkgRow) => ({
          id: p.id,
          tier_name: p.tier_name,
          package_name: p.package_name || `${p.tier_name} Package`,
          summary: p.summary,
          price_cents: p.price_cents,
          currency: p.currency,
          deposit_percent: p.deposit_percent,
          delivery_days: p.delivery_days,
          revisions_included: p.revisions_included,
          is_popular: Boolean(p.is_popular),
          is_active: Boolean(p.is_active),
          features: Array.isArray(p.features) ? p.features.map((f: unknown) => String(f)) : [],
        })),
      };
    });
  } catch {
    return SERVICE_CATALOG.map((item, idx) => ({
      ...item,
      id: item.slug,
      isPublic: true,
      isFeatured: true,
      sortOrder: (idx + 1) * 10,
      rawPackages: [],
    }));
  }
}

export async function getPublicPortfolioItems(options?: {
  includeUnpublished?: boolean;
}): Promise<
  Array<
    PortfolioCaseStudy & {
      dbId: string;
      slug: string;
      isPublished: boolean;
      isFeatured: boolean;
      sortOrder: number;
    }
  >
> {
  try {
    const admin = getSupabaseAdmin();
    let query = admin
      .from('portfolio_items')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!options?.includeUnpublished) {
      query = query.eq('is_published', true);
    }

    const { data, error } = await query;
    const fallbackMapped = PORTFOLIO_ITEMS.map((item, idx) => ({
      ...item,
      dbId: item.id,
      slug: item.id,
      isPublished: true,
      isFeatured: idx < 6,
      sortOrder: (idx + 1) * 10,
    }));
    if (error || !data || data.length === 0) return fallbackMapped;

    const dbMapped = data.map((row) => ({
      dbId: row.id,
      id: row.slug,
      slug: row.slug,
      code: row.code,
      pillar: (row.pillar as ServicePillarKey) || 'cybersecurity',
      pillarLabel: row.pillar_label,
      title: row.title,
      clientSector: row.client_sector,
      year: row.year,
      headlineMetric: row.headline_metric,
      summary: row.summary,
      challenge: row.challenge,
      approach: Array.isArray(row.approach) ? row.approach : [],
      outcomes: Array.isArray(row.outcomes) ? row.outcomes : [],
      stack: Array.isArray(row.stack) ? row.stack : [],
      relatedServiceSlug: row.related_service_slug || 'vapt-penetration-testing',
      externalUrl: row.external_url || undefined,
      isPublished: Boolean(row.is_published),
      isFeatured: Boolean(row.is_featured),
      sortOrder: row.sort_order ?? 0,
    }));

    if (options?.includeUnpublished) {
      return dbMapped;
    }

    const existingSlugs = new Set(dbMapped.map((item) => item.slug));
    const additionalItems = fallbackMapped.filter((item) => !existingSlugs.has(item.slug));
    return [...dbMapped, ...additionalItems];
  } catch {
    return PORTFOLIO_ITEMS.map((item, idx) => ({
      ...item,
      dbId: item.id,
      slug: item.id,
      isPublished: true,
      isFeatured: idx < 6,
      sortOrder: (idx + 1) * 10,
    }));
  }
}

export const DEFAULT_RESUME_ITEMS: ResumeItemRecord[] = [
  // 1. Vendor / Exam Certifications
  {
    id: 'fallback-cert-ceh',
    section: 'vendor_certification',
    title: 'Certified Ethical Hacker (C|EH)',
    organization: 'EC-Council (ANSI / ISO/IEC 17024 Accredited · Cert #ECC8126370954)',
    role_type: null,
    location: null,
    period: 'Nov 2026',
    description: null,
    highlights: [],
    verification_url: CEH_VERIFICATION_URL,
    badge_label: 'C|EH',
    sort_order: 5,
    is_visible: true,
  },
  {
    id: 'fallback-cert-ccep',
    section: 'vendor_certification',
    title: 'Certified Cybersecurity Educator Professional (CCEP)',
    organization: 'Red Team Leaders',
    role_type: null,
    location: null,
    period: 'Nov 2025',
    description: null,
    highlights: [],
    verification_url: 'https://courses.redteamleaders.com/exam-completion/8c0a8dde8e93c63e',
    badge_label: null,
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-cert-gh',
    section: 'vendor_certification',
    title: 'GitHub Foundations',
    organization: 'GitHub',
    role_type: null,
    location: null,
    period: 'Oct 2024',
    description: null,
    highlights: [],
    verification_url: 'https://www.credly.com/badges/f98045ea-b50d-4d57-82a0-af7863ca99b3',
    badge_label: null,
    sort_order: 20,
    is_visible: true,
  },
  {
    id: 'fallback-cert-cnsp',
    section: 'vendor_certification',
    title: 'Certified Network Security Practitioner (CNSP)',
    organization: 'The SecOps Group',
    role_type: null,
    location: null,
    period: 'Jun 2024',
    description: null,
    highlights: [],
    verification_url:
      'https://candidate.speedexam.net/certificate.aspx?SSTATE=am4131EniU8ntjp4bO5mXXavp+YURgGKbVJXOmMyS+V2I8II4rmpHeukqY/dquFBgL7CG9IflgMKW24kDcDENaTU5tQ+NGz8g6ZJkXWlvdU=',
    badge_label: null,
    sort_order: 30,
    is_visible: true,
  },
  {
    id: 'fallback-cert-cap',
    section: 'vendor_certification',
    title: 'Certified AppSec Practitioner (CAP)',
    organization: 'The SecOps Group',
    role_type: null,
    location: null,
    period: 'Mar 2023',
    description: null,
    highlights: [],
    verification_url:
      'https://candidate.speedexam.net/certificate.aspx?SSTATE=am4131EniU8ntjp4bO5mXeivFC8I+nhKTJxcDik4I8GciDzBMMaLBCQtwD6nT3sskY1NsNO4LbFS/u4FEzLyN+iKTamOZcv+Bk3aSG/Ez+I=',
    badge_label: null,
    sort_order: 40,
    is_visible: true,
  },

  // 2. Professional Certificates & Course Completions
  {
    id: 'fallback-prof-cert-1',
    section: 'professional_certificate',
    title: 'Mastering Ethical Hacking Tools',
    organization: 'EC-Council | Learning',
    role_type: null,
    location: null,
    period: 'Nov 2025',
    description: null,
    highlights: [],
    verification_url:
      'https://learn.eccouncil.org/certificate/30e719db-9782-4f31-89a6-4c491b814e76?logged=true',
    badge_label: null,
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-prof-cert-2',
    section: 'professional_certificate',
    title: 'IBM Cybersecurity Analyst (V2)',
    organization: 'Coursera',
    role_type: null,
    location: null,
    period: 'Jul 2025',
    description: null,
    highlights: [],
    verification_url: 'https://www.coursera.org/account/accomplishments/specialization/RQLW1C63J7EP',
    badge_label: null,
    sort_order: 20,
    is_visible: true,
  },
  {
    id: 'fallback-prof-cert-3',
    section: 'professional_certificate',
    title: 'Cloud Computing',
    organization: 'ICT Division, Bangladesh',
    role_type: null,
    location: null,
    period: 'Sep 2024',
    description: null,
    highlights: [],
    verification_url:
      'https://drive.google.com/file/d/1nLkBFU1f4eDN6f19236i4Jk3BXC7MMdc/view?usp=sharing',
    badge_label: null,
    sort_order: 30,
    is_visible: true,
  },
  {
    id: 'fallback-prof-cert-4',
    section: 'professional_certificate',
    title: 'Jr Penetration Tester',
    organization: 'TryHackMe',
    role_type: null,
    location: null,
    period: 'Apr 2024',
    description: null,
    highlights: [],
    verification_url:
      'https://tryhackme-certificates.s3-eu-west-1.amazonaws.com/THM-1F9FZJ3YIU.png',
    badge_label: null,
    sort_order: 40,
    is_visible: true,
  },
  {
    id: 'fallback-prof-cert-5',
    section: 'professional_certificate',
    title: '21st Century Employability Skilling Program - Advanced',
    organization: 'Wadhwani Foundation',
    role_type: null,
    location: null,
    period: 'Nov 2023',
    description: null,
    highlights: [],
    verification_url:
      'https://web.certificate.wfglobal.org/en/certificate?certificateId=655e4528cbe74e70300d680a',
    badge_label: null,
    sort_order: 50,
    is_visible: true,
  },
  {
    id: 'fallback-prof-cert-6',
    section: 'professional_certificate',
    title: 'Cyber Security',
    organization: 'Arena Web Security',
    role_type: null,
    location: null,
    period: 'Jul 2023',
    description: null,
    highlights: [],
    verification_url:
      'https://admission.arenawebsecurity.net/certificate/apiview/verify/?query=A43W1911S016',
    badge_label: null,
    sort_order: 60,
    is_visible: true,
  },

  // 3. Research & Publications
  {
    id: 'fallback-pub-q1',
    section: 'research',
    title: 'Data-Driven Strategies for Digital Native Market Segmentation Using Clustering',
    organization: 'Journal Paper',
    role_type: 'Journal Paper',
    location: null,
    period: '2024',
    description: 'Peer-reviewed Q1 Scopus journal article on clustering and market segmentation.',
    highlights: [
      'Journal: International Journal of Cognitive Computing in Engineering',
      'Indexing: Scopus (Open Access)',
      'Quartile: Q1',
      'Publisher: Elsevier',
      'Online ISSN: 2666-3074',
    ],
    verification_url: 'https://doi.org/10.1016/j.ijcce.2024.04.002',
    badge_label: 'Q1 · Scopus',
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-pub-ieee',
    section: 'research',
    title:
      'Phishing URL Detection Using Comprehensive Feature Extraction and Machine Learning Techniques',
    organization: 'Conference Paper',
    role_type: 'Conference Paper',
    location: 'Jagannath University, Dhaka, Bangladesh',
    period: 'Nov 2024',
    description: 'Peer-reviewed IEEE symposium paper on phishing URL detection.',
    highlights: [
      'Conference: IEEE CS BDC SYMPOSIUM 2024',
      'Date: November 22-23, 2024',
      'Location: Jagannath University, Dhaka, Bangladesh',
    ],
    verification_url: 'https://s24.ieeecsbdc.org/papers/156',
    badge_label: 'IEEE',
    sort_order: 20,
    is_visible: true,
  },

  // 4. Professional Experience
  {
    id: 'fallback-exp-fcd',
    section: 'experience',
    title: 'Founder & CEO',
    organization: 'Fast Cyber Defense',
    role_type: 'Self-employed',
    location: 'Dhaka, Bangladesh · Hybrid',
    period: '10/2024 - Present',
    description: null,
    highlights: [
      'Start-up Leadership — Founded and lead Fast Cyber Defense (fastcyberdefense.com), delivering penetration testing (VAPT), incident response, OSINT threat intelligence, and security engineering engagements.',
      'Direct client security architecture, Rules of Engagement (RoE) governance, and rapid incident recovery across Bangladesh and international markets.',
    ],
    verification_url: 'https://fastcyberdefense.com',
    badge_label: null,
    sort_order: 5,
    is_visible: true,
  },
  {
    id: 'fallback-exp-1',
    section: 'experience',
    title: 'Information Security Freelancer',
    organization: 'Upwork',
    role_type: 'Remote',
    location: 'Worldwide',
    period: '04/2023 - Present',
    description: null,
    highlights: [
      'Completed penetration testing (VAPT) projects for international clients.',
      'Performed an OSINT investigation on a scam website and related scammer network.',
      'Helped clients recover hacked or transferred online accounts, including social media and business assets.',
      'Restored permanently deleted Google Drive files and a lost Word document from OneDrive.',
      'Provided technical and cybersecurity support, from proxy and fingerprint consulting to e-commerce and website tasks.',
    ],
    verification_url: 'https://www.upwork.com/freelancers/~01bd47ab2da223b848',
    badge_label: null,
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-exp-2',
    section: 'experience',
    title: 'Trainer – Machine Learning with Python',
    organization: 'EDGE Project, Jagannath University',
    role_type: 'Training',
    location: 'Dhaka',
    period: '09/2024 - 05/2025',
    description: null,
    highlights: [
      'Conducted hands-on training on Python-based machine learning concepts.',
      'Guided participants through supervised and unsupervised learning techniques, data preprocessing, and model evaluation.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 20,
    is_visible: true,
  },
  {
    id: 'fallback-exp-3',
    section: 'experience',
    title: 'Trainer – Basic Computer Course',
    organization: 'Jagannath University IT Society',
    role_type: 'Training',
    location: 'Dhaka',
    period: '08/2024 - 02/2025',
    description: null,
    highlights: [
      'Conducted training on computer fundamentals and MS Office (Word, PowerPoint, Excel).',
      'Helped participants build confidence in everyday digital tasks and professional documentation.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 30,
    is_visible: true,
  },
  {
    id: 'fallback-exp-4',
    section: 'experience',
    title: 'Trainer – Microsoft Office',
    organization: 'EDGE Project, Jagannath University',
    role_type: 'Training',
    location: 'Dhaka',
    period: '08/2024 - 12/2024',
    description: null,
    highlights: [
      'Conducted practical sessions on Microsoft Office applications including Word, Excel, and PowerPoint.',
      'Delivered foundational IT training as part of the national EDGE capacity-building initiative.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 40,
    is_visible: true,
  },
  {
    id: 'fallback-exp-5',
    section: 'experience',
    title: 'Assistant Trainer',
    organization: 'AsiaInfo Innovation Technologies (Nanjing) Co. Ltd.',
    role_type: 'Contract',
    location: 'Dhaka',
    period: '04/2024 - 04/2024',
    description: null,
    highlights: [
      'Trained Bangladesh Telecommunications Company Limited (BTCL) billing staff on Linux system and server administration.',
      'Covered system configuration, user management, and service hardening (on behalf of AsiaInfo Innovation Technologies (Nanjing) Co. Ltd).',
      'Credential: Certificate of completion received for the module delivered.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 50,
    is_visible: true,
  },
  {
    id: 'fallback-exp-6',
    section: 'experience',
    title: 'Cloud Computing Trainee',
    organization: 'Prime Tech Solutions Ltd.',
    role_type: 'Internship',
    location: 'Dhaka',
    period: '09/2023 - 03/2024',
    description: null,
    highlights: [
      'Implemented cloud technology initiatives, gaining hands-on experience with Linux Server (Ubuntu), Git, GitHub, MySQL, Nginx, AWS, Heroku, and DigitalOcean Droplets.',
      'Applied skills in web development with Django framework and CI/CD, optimizing project workflows through GitHub Actions.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 60,
    is_visible: true,
  },
  {
    id: 'fallback-exp-7',
    section: 'experience',
    title: 'Cybersecurity Internship',
    organization: "Arena Web Security - The Hacker's Arena",
    role_type: 'Internship',
    location: 'Dhaka',
    period: '06/2023 - 07/2023',
    description: null,
    highlights: [
      'Completed comprehensive 5-month Cybersecurity course with 1-month hands-on internship.',
      'Conducted vulnerability assessments and penetration testing on web applications and networks.',
      'Implemented Wazuh as a SIEM platform in a lab environment to centralize log collection, alerts, and basic security event analysis.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 70,
    is_visible: true,
  },

  // 5. Leadership Experience
  {
    id: 'fallback-lead-1',
    section: 'leadership',
    title: 'Research Fellow',
    organization: 'ITRRC Cybersecurity Research Lab, Jagannath University',
    role_type: null,
    location: 'Dhaka',
    period: '06/2024 - Present',
    description: null,
    highlights: [
      'Coordinate lab activities and maintain the cybersecurity research community.',
      'Lead bi-weekly training and assessments for lab members on cybersecurity topics.',
      'Conduct cybersecurity research and support trainees working on security-focused projects and publications under lab mentors.',
      'Help lab members connect and discuss ideas with Jagannath University faculty and Bangladeshi-origin professors now based abroad.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-lead-2',
    section: 'leadership',
    title: 'Former President',
    organization: 'Jagannath University IT Society',
    role_type: null,
    location: 'Dhaka',
    period: '07/2023 - 07/2025',
    description: null,
    highlights: [
      'Led a 200+ member student IT society, coordinating IT-focused events and workshops.',
      'Mentored members through learning activities and career-focused guidance.',
      'Organized and supported programs to build practical tech skills and peer collaboration.',
      'Now serve as an alumni / advisor to the new committee, sharing context and guidance when needed.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 20,
    is_visible: true,
  },
  {
    id: 'fallback-lead-3',
    section: 'leadership',
    title: 'General Member to Vice President',
    organization: 'Jagannath University IT Society',
    role_type: null,
    location: 'Dhaka',
    period: '11/2017 - 07/2023',
    description: null,
    highlights: [
      'Progressed from general member to elected Vice President of the society.',
      'Helped plan and organize IT events, seminars, and workshops for students.',
      'Developed strong organizational and leadership skills through coordinating activities and working with members.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 30,
    is_visible: true,
  },
  {
    id: 'fallback-lead-4',
    section: 'leadership',
    title: 'Former Vice-President',
    organization: 'Sherpur District Student Welfare Council, Jagannath University',
    role_type: null,
    location: 'Dhaka',
    period: '01/2018 - 11/2021',
    description: null,
    highlights: [
      'Co-founded and helped lead the council to support the educational and social needs of students from Sherpur District.',
      'Organized welfare and fundraising activities to assist underprivileged students with access to education and essential resources.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 40,
    is_visible: true,
  },

  // 6. Education
  {
    id: 'fallback-edu-msc',
    section: 'education',
    title: 'MSc in Computer Science & Engineering',
    organization: 'Jagannath University',
    role_type: null,
    location: 'Dhaka, Bangladesh',
    period: '2022 · CGPA: 2.88/4.0',
    description: null,
    highlights: [],
    verification_url: null,
    badge_label: null,
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-edu-bsc',
    section: 'education',
    title: 'BSc in Computer Science & Engineering',
    organization: 'Jagannath University',
    role_type: null,
    location: 'Dhaka, Bangladesh',
    period: '2020 · CGPA: 3.15/4.00',
    description: null,
    highlights: [],
    verification_url: null,
    badge_label: null,
    sort_order: 20,
    is_visible: true,
  },
  {
    id: 'fallback-edu-hsc',
    section: 'education',
    title: 'Higher Secondary Certificate',
    organization: 'Cambrian College',
    role_type: null,
    location: 'Dhaka, Bangladesh',
    period: '2016 · GPA: 4.83/5.0',
    description: null,
    highlights: [],
    verification_url: null,
    badge_label: null,
    sort_order: 30,
    is_visible: true,
  },
  {
    id: 'fallback-edu-ssc',
    section: 'education',
    title: 'Secondary School Certificate',
    organization: 'Sonkanda Dr. M. T Hossain High School',
    role_type: null,
    location: 'Sherpur, Bangladesh',
    period: '2014 · GPA: 4.56/5.0',
    description: null,
    highlights: [],
    verification_url: null,
    badge_label: null,
    sort_order: 40,
    is_visible: true,
  },
];

export async function getSiteSettingsAndResume(options?: {
  includeHidden?: boolean;
}): Promise<{
  settings: SiteSettingsRecord;
  items: ResumeItemRecord[];
}> {
  const defaultSettings: SiteSettingsRecord = {
    id: 'default',
    full_name: 'Md. Redwan Ahmed',
    role_title: 'Computer Science & Engineering Professional',
    short_role: SITE.shortRole,
    subtitle: 'Cybersecurity Researcher | Information Security Freelancer | Educator',
    tagline: SITE.tagline,
    executive_summary:
      "Computer Science & Engineering professional developing practical skills in information security, cyber defense, and system administration, with growing experience as a freelancer and trainer. I am actively building my expertise through hands-on security work, teaching activities, and continuous self-learning, with a focus on applying Machine Learning and Artificial Intelligence to real-world security problems. I'm particularly interested in roles and environments that allow me to strengthen my technical foundations, contribute to secure system design, support others through mentoring and training, and gradually transition into more advanced responsibilities in both the information security industry and research.",
    email: SITE.email,
    phone: SITE.phoneDisplay,
    whatsapp_number: SITE.whatsappNumber,
    location: 'Dhaka, BD',
    cal_com_url: SITE.calComUrl,
    company_name: SITE.company.name,
    company_url: SITE.company.url,
    linkedin_url: SITE.socials.linkedin,
    github_url: SITE.socials.github,
    website_url: SITE.url,
    resume_pdf_url: '/resume.pdf',
    credentials: [...SITE.credentials],
    research_interests: [
      'Cyber Security',
      'Machine Learning',
      'Artificial Intelligence',
    ],
    technical_skills: {
      Cybersecurity: [
        'Ethical Hacking',
        'Vulnerability Assessment & Penetration Testing',
        'Open-Source Intelligence (OSINT)',
        'Network Security',
        'Cryptography (fundamentals)',
      ],
      Networking: [
        'Cyber Security & Networking',
        'Networking Protocols & Standards',
        'Network Troubleshooting',
      ],
      'Tools & Cloud': [
        'Burp Suite',
        'OWASP ZAP',
        'Nmap',
        'Nessus',
        'OpenVAS',
        'Metasploit',
        'SQLmap',
        'Hydra',
        'gobuster',
        'wpscan',
        'Postman (API testing)',
        'Wazuh (SIEM)',
      ],
      'System Administration': [
        'System Administration',
        'Linux System Administration (Ubuntu, CentOS)',
        'Virtualization & Containerization',
        'Configuration Management',
        'Backup & Recovery',
      ],
      'Dev & Scripting': [
        'AWS',
        'Azure IAM',
        'DigitalOcean',
        'EC2',
        'Docker',
        'CI/CD (Jenkins, GitHub Actions)',
        'Kubernetes (basics)',
        'Git',
      ],
      'Programming & Scripting': [
        'Python',
        'C/C++',
        'Java',
        'PHP',
        'C#',
        'MySQL',
        'Shell Scripting',
        'PowerShell Scripting',
        'Batch Scripting',
      ],
    },
    soft_skills: [
      'Analytical Thinking',
      'Communication',
      'Team Collaboration & Leadership',
      'Public Speaking',
    ],
    other_skills: [
      'Technical Documentation',
      'MS Office 365',
      'Google Workspace',
      'Tech Support',
    ],
    hobbies: [
      {
        name: 'Cybersecurity Research',
        description:
          'Actively researching emerging threats, vulnerabilities, and security methodologies to stay ahead in the field.',
      },
      {
        name: 'Open Source Contribution',
        description:
          'Contributing to security tools and frameworks on GitHub, collaborating with the global developer community.',
      },
      {
        name: 'Capture The Flag (CTF) Challenges',
        description:
          'Participating in cybersecurity competitions to sharpen problem-solving skills and explore ethical hacking techniques.',
      },
      {
        name: 'Technical Writing & Documentation',
        description:
          'Creating guides, tutorials, and technical documentation to share knowledge with the security community.',
      },
      {
        name: 'Teaching & Mentoring',
        description:
          'Training aspiring cybersecurity professionals and students, sharing practical knowledge and industry best practices.',
      },
      {
        name: 'Technology Exploration',
        description:
          'Continuously learning new programming languages, frameworks, and security tools to expand technical expertise.',
      },
    ],
    references_list: [
      {
        name: 'Prof. Dr. Md. Abu Layek',
        title: 'Professor, Department of Computer Science and Engineering',
        institution: 'Jagannath University, Dhaka-1100, Bangladesh',
        email: 'abulayek@yahoo.com',
        phone: '+880 1841-465733',
      },
      {
        name: 'Prof. Dr. Uzzal Kumar Acharjee',
        title: 'Professor, Department of Computer Science and Engineering',
        institution: 'Jagannath University, Dhaka-1100, Bangladesh',
        email: 'uzzal@cse.jnu.ac.bd',
        phone: '+880 1625-099037',
      },
    ],
  };

  try {
    const admin = getSupabaseAdmin();
    let itemsQuery = admin
      .from('resume_items')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!options?.includeHidden) {
      itemsQuery = itemsQuery.eq('is_visible', true);
    }

    const [{ data: settingsRow }, { data: itemsRows }] = await Promise.all([
      admin.from('site_settings').select('*').eq('id', 'default').maybeSingle(),
      itemsQuery,
    ]);

    const rawCreds =
      settingsRow && Array.isArray(settingsRow.credentials) && settingsRow.credentials.length > 0
        ? (settingsRow.credentials as Array<{ code: string; label: string }>)
        : defaultSettings.credentials;
    const mergedCredentials = rawCreds.some((c) => c.code === 'C|EH')
      ? rawCreds
      : [{ code: 'C|EH', label: 'Certified Ethical Hacker (EC-Council)' }, ...rawCreds];

    const settings: SiteSettingsRecord = settingsRow
      ? {
          id: settingsRow.id,
          full_name: settingsRow.full_name || defaultSettings.full_name,
          role_title: settingsRow.role_title || defaultSettings.role_title,
          short_role: settingsRow.short_role || defaultSettings.short_role,
          subtitle: settingsRow.subtitle || defaultSettings.subtitle,
          tagline:
            settingsRow.tagline && /C\|EH/i.test(settingsRow.tagline)
              ? settingsRow.tagline
              : defaultSettings.tagline,
          executive_summary: settingsRow.executive_summary || defaultSettings.executive_summary,
          email: settingsRow.email || defaultSettings.email,
          phone: settingsRow.phone || defaultSettings.phone,
          whatsapp_number: settingsRow.whatsapp_number || defaultSettings.whatsapp_number,
          location: settingsRow.location || defaultSettings.location,
          cal_com_url: settingsRow.cal_com_url || defaultSettings.cal_com_url,
          company_name: settingsRow.company_name || defaultSettings.company_name,
          company_url: settingsRow.company_url || defaultSettings.company_url,
          linkedin_url: settingsRow.linkedin_url || defaultSettings.linkedin_url,
          github_url: settingsRow.github_url || defaultSettings.github_url,
          website_url: settingsRow.website_url || defaultSettings.website_url,
          resume_pdf_url: settingsRow.resume_pdf_url || defaultSettings.resume_pdf_url,
          credentials: mergedCredentials,
          research_interests:
            Array.isArray(settingsRow.research_interests) &&
            settingsRow.research_interests.length > 0
              ? settingsRow.research_interests
              : defaultSettings.research_interests,
          technical_skills:
            settingsRow.technical_skills &&
            typeof settingsRow.technical_skills === 'object' &&
            !Array.isArray(settingsRow.technical_skills) &&
            Object.keys(settingsRow.technical_skills as Record<string, unknown>).length > 0
              ? (settingsRow.technical_skills as Record<string, string[]>)
              : defaultSettings.technical_skills,
          soft_skills:
            Array.isArray(settingsRow.soft_skills) && settingsRow.soft_skills.length > 0
              ? settingsRow.soft_skills
              : defaultSettings.soft_skills,
          other_skills:
            Array.isArray(settingsRow.other_skills) && settingsRow.other_skills.length > 0
              ? settingsRow.other_skills
              : defaultSettings.other_skills,
          hobbies:
            Array.isArray(settingsRow.hobbies) && settingsRow.hobbies.length > 0
              ? (settingsRow.hobbies as Array<{ name: string; description: string }>)
              : defaultSettings.hobbies,
          references_list:
            Array.isArray(settingsRow.references_list) && settingsRow.references_list.length > 0
              ? (settingsRow.references_list as SiteSettingsRecord['references_list'])
              : defaultSettings.references_list,
        }
      : defaultSettings;

    const dbItems: ResumeItemRecord[] = (itemsRows ?? []).map((r) => ({
      id: r.id,
      section: r.section as ResumeItemRecord['section'],
      title: r.title,
      organization: r.organization,
      role_type: r.role_type,
      location: r.location,
      period: r.period,
      description: r.description,
      highlights: Array.isArray(r.highlights) ? r.highlights : [],
      verification_url: r.verification_url,
      badge_label: r.badge_label,
      sort_order: r.sort_order,
      is_visible: Boolean(r.is_visible),
    }));

    if (options?.includeHidden) {
      return { settings, items: dbItems.length > 0 ? dbItems : DEFAULT_RESUME_ITEMS };
    }

    // Ensure every resume section has complete entries by falling back per-section if a section is empty in DB
    const sections: Array<ResumeItemRecord['section']> = [
      'vendor_certification',
      'professional_certificate',
      'research',
      'experience',
      'leadership',
      'education',
    ];
    const mergedItems: ResumeItemRecord[] = [];
    for (const sec of sections) {
      const secRows = dbItems.filter((item) => item.section === sec);
      if (secRows.length > 0) {
        if (
          sec === 'vendor_certification' &&
          !secRows.some((item) => /Certified Ethical Hacker/i.test(item.title))
        ) {
          const defaultCeh = DEFAULT_RESUME_ITEMS.find((item) => item.id === 'fallback-cert-ceh');
          if (defaultCeh) {
            mergedItems.push(defaultCeh);
          }
        }
        if (
          sec === 'experience' &&
          !secRows.some(
            (item) => /Fast Cyber Defense/i.test(item.organization) && /Founder/i.test(item.title)
          )
        ) {
          const defaultFcd = DEFAULT_RESUME_ITEMS.find((item) => item.id === 'fallback-exp-fcd');
          if (defaultFcd) {
            mergedItems.push(defaultFcd);
          }
        }
        if (sec === 'education') {
          mergedItems.push(
            ...secRows.map((item) => {
              if (item.title === 'MSc in Computer Science & Engineering' && item.period === 'Ongoing') {
                return { ...item, period: '2022 · CGPA: 2.88/4.0' };
              }
              if (
                item.title === 'BSc in Computer Science & Engineering' &&
                (item.period === '2021 · CGPA: 3.15/4.00' || item.period === '2020')
              ) {
                return { ...item, period: '2020 · CGPA: 3.15/4.00' };
              }
              if (item.title === 'Higher Secondary Certificate' && item.period === '2016') {
                return { ...item, period: '2016 · GPA: 4.83/5.0' };
              }
              if (item.title === 'Secondary School Certificate' && item.period === '2014') {
                return { ...item, period: '2014 · GPA: 4.56/5.0' };
              }
              return item;
            })
          );
          continue;
        }
        mergedItems.push(...secRows);
      } else {
        mergedItems.push(...DEFAULT_RESUME_ITEMS.filter((item) => item.section === sec));
      }
    }

    return {
      settings,
      items: mergedItems,
    };
  } catch {
    return { settings: defaultSettings, items: DEFAULT_RESUME_ITEMS };
  }
}

export interface ApprovedClientReview {
  id: string;
  authorName: string;
  authorRole: string;
  rating: number;
  headline: string | null;
  content: string;
  createdAt: string;
}

export async function getApprovedClientReviews(): Promise<ApprovedClientReview[]> {
  try {
    const admin = getSupabaseAdmin();
    const { data: reviewRows, error } = await admin
      .from('client_reviews')
      .select('id, client_id, rating_overall, headline, review_text, created_at')
      .eq('is_public_approved', true)
      .order('created_at', { ascending: false })
      .limit(12);

    if (error || !reviewRows || reviewRows.length === 0) {
      return [];
    }

    const clientIds = Array.from(new Set(reviewRows.map((r) => r.client_id)));
    const [{ data: profiles }, { data: clientProfiles }] = await Promise.all([
      admin.from('profiles').select('id, full_name').in('id', clientIds),
      admin.from('client_profiles').select('user_id, company_name, company_role').in('user_id', clientIds),
    ]);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const clientMetaMap = new Map(
      (clientProfiles ?? []).map((cp) => [
        cp.user_id,
        [cp.company_role, cp.company_name].filter(Boolean).join(', ') || 'Verified Portal Client',
      ])
    );

    return reviewRows.map((row) => ({
      id: row.id,
      authorName: profileMap.get(row.client_id) || 'Verified Client',
      authorRole: clientMetaMap.get(row.client_id) || 'Verified Portal Client',
      rating: Math.min(5, Math.max(1, Number(row.rating_overall) || 5)),
      headline: row.headline ?? null,
      content: row.review_text,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}
