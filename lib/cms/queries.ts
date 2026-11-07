import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  SERVICE_CATALOG,
  SERVICE_PILLARS,
  SITE,
  type ServiceCatalogItem,
  type ServicePackageSeed,
  type ServicePillarKey,
} from '@/lib/content/site';
import type { PortfolioCaseStudy } from '@/components/portfolio-showcase';

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
          : row.starting_price_cents || 25000;
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
        startingPriceCents: row.starting_price_cents || minPrice,
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
    if (error || !data) return [];

    return data.map((row) => ({
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
  } catch {
    return [];
  }
}

export async function getSiteSettingsAndResume(options?: {
  includeHidden?: boolean;
}): Promise<{
  settings: SiteSettingsRecord;
  items: ResumeItemRecord[];
}> {
  const defaultSettings: SiteSettingsRecord = {
    id: 'default',
    full_name: 'Md. Redwan Ahmed',
    role_title: SITE.role,
    short_role: SITE.shortRole,
    subtitle:
      'Offensive Security & VAPT Specialist | Full-Stack & Cloud Consultant | Q1 Scopus & IEEE Researcher | Educator',
    tagline: SITE.tagline,
    executive_summary:
      'Computer Science & Engineering professional specializing in offensive security (VAPT & OSINT), full-stack software engineering, Linux/cloud infrastructure, and applied machine learning. Proven track record delivering international penetration testing, digital fraud investigations, incident recovery, and custom web platforms alongside peer-reviewed Q1 Scopus and IEEE research publications.',
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
      'Cyber Security & Threat Intelligence',
      'Applied Machine Learning',
      'Explainable Artificial Intelligence (XAI)',
      'Cloud & Network Defense',
    ],
    technical_skills: {},
    soft_skills: [],
    other_skills: [],
    hobbies: [],
    references_list: [],
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

    const settings: SiteSettingsRecord = settingsRow
      ? {
          id: settingsRow.id,
          full_name: settingsRow.full_name,
          role_title: settingsRow.role_title,
          short_role: settingsRow.short_role,
          subtitle: settingsRow.subtitle,
          tagline: settingsRow.tagline,
          executive_summary: settingsRow.executive_summary,
          email: settingsRow.email,
          phone: settingsRow.phone,
          whatsapp_number: settingsRow.whatsapp_number,
          location: settingsRow.location,
          cal_com_url: settingsRow.cal_com_url,
          company_name: settingsRow.company_name,
          company_url: settingsRow.company_url,
          linkedin_url: settingsRow.linkedin_url,
          github_url: settingsRow.github_url,
          website_url: settingsRow.website_url,
          resume_pdf_url: settingsRow.resume_pdf_url,
          credentials: Array.isArray(settingsRow.credentials)
            ? (settingsRow.credentials as Array<{ code: string; label: string }>)
            : defaultSettings.credentials,
          research_interests: Array.isArray(settingsRow.research_interests)
            ? settingsRow.research_interests
            : defaultSettings.research_interests,
          technical_skills:
            settingsRow.technical_skills &&
            typeof settingsRow.technical_skills === 'object' &&
            !Array.isArray(settingsRow.technical_skills)
              ? (settingsRow.technical_skills as Record<string, string[]>)
              : {},
          soft_skills: Array.isArray(settingsRow.soft_skills)
            ? settingsRow.soft_skills
            : [],
          other_skills: Array.isArray(settingsRow.other_skills)
            ? settingsRow.other_skills
            : [],
          hobbies: Array.isArray(settingsRow.hobbies)
            ? (settingsRow.hobbies as Array<{ name: string; description: string }>)
            : [],
          references_list: Array.isArray(settingsRow.references_list)
            ? (settingsRow.references_list as SiteSettingsRecord['references_list'])
            : [],
        }
      : defaultSettings;

    const items: ResumeItemRecord[] = (itemsRows ?? []).map((r) => ({
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

    return { settings, items };
  } catch {
    return { settings: defaultSettings, items: [] };
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
