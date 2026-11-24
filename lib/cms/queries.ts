import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  PORTFOLIO_ITEMS,
  SERVICE_CATALOG,
  SERVICE_PILLARS,
  SITE,
  type PortfolioCaseStudy,
  type ServiceCatalogItem,
  type ServicePackageSeed,
  type ServicePillarKey,
} from '@/lib/content/site';
import {
  ACADEMIC_REFERENCE_SCHOLAR_URLS,
  DEFAULT_RESUME_ITEMS,
  DEFAULT_SITE_SETTINGS,
  reconcileCredentials,
  reconcileReferencesList,
  reconcileResumeSubtitle,
  reconcileRoleTitle,
  reconcileStringList,
  reconcileTechnicalSkills,
  type ResumeItemRecord,
  type SiteSettingsRecord,
} from '@/lib/cms/resume-defaults';

export {
  ACADEMIC_REFERENCE_SCHOLAR_URLS,
  DEFAULT_RESUME_ITEMS,
  type ResumeItemRecord,
  type SiteSettingsRecord,
};

/** Safe React.cache wrapper that degrades cleanly in non-RSC unit test runtimes. */
const reactCache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof cache === 'function' ? cache : (fn) => fn;

export type PublicServiceCatalogRecord = ServiceCatalogItem & {
  id: string;
  isPublic: boolean;
  isFeatured: boolean;
  sortOrder: number;
  toolsTags?: string[];
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
};

const fetchPublicServicesCatalogCached = reactCache(async function fetchPublicServicesCatalog(
  includeHidden: boolean
): Promise<PublicServiceCatalogRecord[]> {
  try {
    const admin = getSupabaseAdmin();
    let query = admin
      .from('services')
      .select('*, service_packages(*)')
      .order('sort_order', { ascending: true });

    if (!includeHidden) {
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
        .filter((p: RawPkgRow) => includeHidden || p.is_active !== false)
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
        toolsTags: Array.isArray(row.tools_tags) ? row.tools_tags.map(String) : [],
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
});

export async function getPublicServicesCatalog(options?: {
  includeHidden?: boolean;
}): Promise<PublicServiceCatalogRecord[]> {
  return fetchPublicServicesCatalogCached(Boolean(options?.includeHidden));
}

export type PublicPortfolioRecord = PortfolioCaseStudy & {
  dbId: string;
  slug: string;
  isPublished: boolean;
  isFeatured: boolean;
  sortOrder: number;
};

const fetchPublicPortfolioItemsCached = reactCache(async function fetchPublicPortfolioItems(
  includeUnpublished: boolean
): Promise<PublicPortfolioRecord[]> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('portfolio_items')
      .select('*')
      .order('sort_order', { ascending: true });

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

    const visibleDbMapped = dbMapped.filter((item) => item.isPublished);
    if (includeUnpublished) {
      return dbMapped;
    }
    if (dbMapped.length > 0) {
      return visibleDbMapped;
    }
    return fallbackMapped;
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
});

export async function getPublicPortfolioItems(options?: {
  includeUnpublished?: boolean;
}): Promise<PublicPortfolioRecord[]> {
  return fetchPublicPortfolioItemsCached(Boolean(options?.includeUnpublished));
}

const fetchSiteSettingsAndResumeCached = reactCache(async function fetchSiteSettingsAndResume(
  includeHidden: boolean
): Promise<{
  settings: SiteSettingsRecord;
  items: ResumeItemRecord[];
}> {
  const defaultSettings = DEFAULT_SITE_SETTINGS;

  try {
    const admin = getSupabaseAdmin();
    let itemsQuery = admin
      .from('resume_items')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!includeHidden) {
      itemsQuery = itemsQuery.eq('is_visible', true);
    }

    const [{ data: settingsRow }, { data: itemsRows }] = await Promise.all([
      admin.from('site_settings').select('*').eq('id', 'default').maybeSingle(),
      itemsQuery,
    ]);

    const mergedCredentials = reconcileCredentials(
      settingsRow?.credentials,
      defaultSettings.credentials
    );

    const settings: SiteSettingsRecord = settingsRow
      ? {
          id: settingsRow.id,
          full_name: settingsRow.full_name || defaultSettings.full_name,
          short_role: settingsRow.short_role || defaultSettings.short_role,
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
          role_title: reconcileRoleTitle(settingsRow.role_title),
          subtitle: reconcileResumeSubtitle(settingsRow.subtitle),
          credentials: mergedCredentials,
          research_interests:
            Array.isArray(settingsRow.research_interests) &&
            settingsRow.research_interests.length > 0
              ? settingsRow.research_interests
              : defaultSettings.research_interests,
          technical_skills: reconcileTechnicalSkills(
            settingsRow.technical_skills,
            defaultSettings.technical_skills
          ),
          soft_skills: reconcileStringList(
            settingsRow.soft_skills,
            [
              'Analytical Thinking',
              'Executive Communication',
              'Team Collaboration & Leadership',
              'Public Speaking & Technical Training',
            ],
            defaultSettings.soft_skills
          ),
          other_skills: reconcileStringList(
            settingsRow.other_skills,
            [
              'Technical & Security Documentation',
              'MS Office 365',
              'Google Workspace',
              'Executive Tech Support & Incident Recovery',
            ],
            defaultSettings.other_skills
          ),
          hobbies:
            Array.isArray(settingsRow.hobbies) && settingsRow.hobbies.length > 0
              ? (settingsRow.hobbies as Array<{ name: string; description: string }>)
              : defaultSettings.hobbies,
          references_list: reconcileReferencesList(
            settingsRow.references_list,
            defaultSettings.references_list
          ),
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

    if (includeHidden) {
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
        if (sec === 'experience') {
          if (
            !secRows.some(
              (item) => /Fast Cyber Defense/i.test(item.organization) && /Founder/i.test(item.title)
            )
          ) {
            const defaultFcd = DEFAULT_RESUME_ITEMS.find((item) => item.id === 'fallback-exp-fcd');
            if (defaultFcd) {
              mergedItems.push(defaultFcd);
            }
          }
          mergedItems.push(
            ...secRows.map((item) => {
              if (/AsiaInfo Innovation Technologies/i.test(item.organization)) {
                return {
                  ...item,
                  title:
                    item.title === 'Assistant Trainer'
                      ? 'Assistant Trainer (Linux Server Administration)'
                      : item.title,
                  highlights: item.highlights.map((hl) => {
                    if (
                      hl ===
                      'Trained Bangladesh Telecommunications Company Limited (BTCL) billing staff on Linux system and server administration.'
                    ) {
                      return 'Trained Bangladesh Telecommunications Company Limited (BTCL) billing staff on CentOS Linux system and server administration.';
                    }
                    if (
                      hl ===
                        'Covered system configuration, user management, and service hardening (on behalf of AsiaInfo Innovation Technologies).' ||
                      hl ===
                        'Covered system configuration, user management, and service hardening (on behalf of AsiaInfo Innovation Technologies (Nanjing) Co. Ltd).'
                    ) {
                      return 'Covered CentOS system configuration, user management, and service hardening (on behalf of AsiaInfo Innovation Technologies (Nanjing) Co. Ltd).';
                    }
                    return hl;
                  }),
                };
              }
              return item;
            })
          );
          continue;
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
});

export async function getSiteSettingsAndResume(options?: {
  includeHidden?: boolean;
}): Promise<{
  settings: SiteSettingsRecord;
  items: ResumeItemRecord[];
}> {
  return fetchSiteSettingsAndResumeCached(Boolean(options?.includeHidden));
}

export const getPublicContactChannels = reactCache(async function fetchPublicContactChannels(): Promise<{
  whatsapp_number: string;
  cal_com_url: string;
}> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('site_settings')
      .select('whatsapp_number, cal_com_url')
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return {
        whatsapp_number: SITE.whatsappNumber,
        cal_com_url: SITE.calComUrl,
      };
    }

    return {
      whatsapp_number: data.whatsapp_number || SITE.whatsappNumber,
      cal_com_url: data.cal_com_url || SITE.calComUrl,
    };
  } catch {
    return {
      whatsapp_number: SITE.whatsappNumber,
      cal_com_url: SITE.calComUrl,
    };
  }
});

export interface ApprovedClientReview {
  id: string;
  authorName: string;
  authorRole: string;
  rating: number;
  headline: string | null;
  content: string;
  createdAt: string;
}

export const getApprovedClientReviews = reactCache(
  async function fetchApprovedClientReviews(): Promise<ApprovedClientReview[]> {
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
);
