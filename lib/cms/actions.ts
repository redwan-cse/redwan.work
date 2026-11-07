'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/crm/audit';
import { SERVICE_PILLARS, type ServicePillarKey } from '@/lib/content/site';
import { parseFormBoolean } from '@/lib/forms/boolean';

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== 'admin') {
    throw new Error('Unauthorized: Admin role required.');
  }
  return session;
}

function parseLines(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ============================================================================
// 1. SERVICES & PACKAGES CRUD ACTIONS
// ============================================================================

export async function upsertServiceAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();

  const id = String(formData.get('id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const rawSlug = String(formData.get('slug') ?? '').trim();
  const slug = (rawSlug || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const pillar = (String(formData.get('pillar') ?? 'cybersecurity') as ServicePillarKey);
  const tagline = String(formData.get('tagline') ?? '').trim() || title;
  const description = String(formData.get('description') ?? '').trim() || tagline;
  const startingPriceUsd = Number(formData.get('starting_price_usd') ?? 250);
  const startingPriceCents = Math.max(0, Math.round(startingPriceUsd * 100));
  const deliveryDaysMin = Math.max(1, Number(formData.get('delivery_days_min') ?? 3));
  const deliveryDaysMax = Math.max(deliveryDaysMin, Number(formData.get('delivery_days_max') ?? 10));
  const sortOrder = Number(formData.get('sort_order') ?? 10);
  const requiresRoe = parseFormBoolean(formData, 'requires_roe');
  const isPublic = parseFormBoolean(formData, 'is_public');
  const isFeatured = parseFormBoolean(formData, 'is_featured');
  const highlights = parseLines(formData.get('highlights'));

  if (!title || !slug) return;

  const payload = {
    slug,
    pillar,
    title,
    tagline,
    description,
    requires_roe: requiresRoe,
    starting_price_cents: startingPriceCents,
    delivery_days_min: deliveryDaysMin,
    delivery_days_max: deliveryDaysMax,
    highlights,
    tools_tags: highlights,
    is_public: isPublic,
    is_featured: isFeatured,
    sort_order: sortOrder,
  };

  if (id) {
    const { error } = await admin.from('services').update(payload).eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from('services').insert(payload);
    if (error) throw new Error(error.message);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: id ? 'cms.service_updated' : 'cms.service_created',
    entityType: 'service',
    entityId: id || null,
    summary: `${id ? 'Updated' : 'Created'} service "${title}" (${slug})`,
  });

  revalidatePath('/');
  revalidatePath('/services');
  revalidatePath('/contact');
  revalidatePath('/portal/orders/new');
  revalidatePath('/admin/services');
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const { error } = await admin.from('services').delete().eq('id', id);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'cms.service_deleted',
    entityType: 'service',
    entityId: id,
    summary: `Deleted service ${id}`,
  });

  revalidatePath('/');
  revalidatePath('/services');
  revalidatePath('/contact');
  revalidatePath('/portal/orders/new');
  revalidatePath('/admin/services');
}

export async function upsertServicePackageAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();

  const id = String(formData.get('id') ?? '').trim();
  const serviceId = String(formData.get('service_id') ?? '').trim();
  const tierName = String(formData.get('tier_name') ?? 'Standard').trim();
  const packageName =
    String(formData.get('package_name') ?? '').trim() || `${tierName} Package`;
  const summary = String(formData.get('summary') ?? '').trim() || packageName;
  const priceUsd = Number(formData.get('price_usd') ?? 500);
  const priceCents = Math.max(0, Math.round(priceUsd * 100));
  const depositPercent = Math.min(100, Math.max(0, Number(formData.get('deposit_percent') ?? 50)));
  const deliveryDays = Math.max(1, Number(formData.get('delivery_days') ?? 7));
  const revisionsIncluded = Math.max(0, Number(formData.get('revisions_included') ?? 2));
  const isPopular = parseFormBoolean(formData, 'is_popular');
  const isActive = parseFormBoolean(formData, 'is_active');
  const features = parseLines(formData.get('features'));
  const sortOrder =
    tierName === 'Starter' ? 1 : tierName === 'Standard' ? 2 : tierName === 'Enterprise' ? 3 : 4;

  if (!serviceId) return;

  const payload = {
    service_id: serviceId,
    tier_name: tierName,
    package_name: packageName,
    summary,
    price_cents: priceCents,
    deposit_percent: depositPercent,
    delivery_days: deliveryDays,
    revisions_included: revisionsIncluded,
    is_popular: isPopular,
    is_active: isActive,
    features,
    sort_order: sortOrder,
  };

  if (id) {
    const { error } = await admin.from('service_packages').update(payload).eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from('service_packages')
      .upsert(payload, { onConflict: 'service_id,tier_name' });
    if (error) throw new Error(error.message);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'cms.service_package_upserted',
    entityType: 'service_package',
    entityId: id || serviceId,
    summary: `Saved ${tierName} package "${packageName}" ($${priceUsd})`,
  });

  revalidatePath('/');
  revalidatePath('/services');
  revalidatePath('/contact');
  revalidatePath('/portal/orders/new');
  revalidatePath('/admin/services');
}

export async function deleteServicePackageAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const { error } = await admin.from('service_packages').delete().eq('id', id);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'cms.service_package_deleted',
    entityType: 'service_package',
    entityId: id,
    summary: `Deleted service package ${id}`,
  });

  revalidatePath('/');
  revalidatePath('/services');
  revalidatePath('/contact');
  revalidatePath('/portal/orders/new');
  revalidatePath('/admin/services');
}

// ============================================================================
// 2. PORTFOLIO CASE STUDIES CRUD ACTIONS
// ============================================================================

export async function upsertPortfolioItemAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();

  const id = String(formData.get('id') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim() || `CS-${Math.floor(100 + Math.random() * 900)}`;
  const title = String(formData.get('title') ?? '').trim();
  const rawSlug = String(formData.get('slug') ?? '').trim();
  const slug = (rawSlug || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const pillar = (String(formData.get('pillar') ?? 'cybersecurity') as ServicePillarKey);
  const pillarLabel =
    SERVICE_PILLARS[pillar]?.label ?? 'Cybersecurity & Offensive Security';
  const clientSector = String(formData.get('client_sector') ?? '').trim() || 'Enterprise Client';
  const year = String(formData.get('year') ?? '2026').trim();
  const headlineMetric = String(formData.get('headline_metric') ?? '').trim();
  const summary = String(formData.get('summary') ?? '').trim();
  const challenge = String(formData.get('challenge') ?? '').trim() || summary;
  const approach = parseLines(formData.get('approach'));
  const outcomes = parseLines(formData.get('outcomes'));
  const stack = String(formData.get('stack') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const relatedServiceSlug =
    String(formData.get('related_service_slug') ?? '').trim() || null;
  const externalUrl = String(formData.get('external_url') ?? '').trim() || null;
  const sortOrder = Number(formData.get('sort_order') ?? 10);
  const isPublished = parseFormBoolean(formData, 'is_published');
  const isFeatured = parseFormBoolean(formData, 'is_featured');

  if (!title || !slug) return;

  const payload = {
    code,
    slug,
    pillar,
    pillar_label: pillarLabel,
    title,
    client_sector: clientSector,
    year,
    headline_metric: headlineMetric,
    summary,
    challenge,
    approach,
    outcomes,
    stack,
    related_service_slug: relatedServiceSlug,
    external_url: externalUrl,
    is_published: isPublished,
    is_featured: isFeatured,
    sort_order: sortOrder,
  };

  if (id) {
    const { error } = await admin.from('portfolio_items').update(payload).eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from('portfolio_items').insert(payload);
    if (error) throw new Error(error.message);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: id ? 'cms.portfolio_updated' : 'cms.portfolio_created',
    entityType: 'portfolio_item',
    entityId: id || null,
    summary: `${id ? 'Updated' : 'Created'} portfolio case study "${title}" (${code})`,
  });

  revalidatePath('/');
  revalidatePath('/portfolio');
  revalidatePath('/admin/portfolio');
}

export async function deletePortfolioItemAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const { error } = await admin.from('portfolio_items').delete().eq('id', id);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'cms.portfolio_deleted',
    entityType: 'portfolio_item',
    entityId: id,
    summary: `Deleted portfolio case study ${id}`,
  });

  revalidatePath('/');
  revalidatePath('/portfolio');
  revalidatePath('/admin/portfolio');
}

// ============================================================================
// 3. RESUME & SITE PROFILE CRUD ACTIONS
// ============================================================================

export async function updateSiteSettingsAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();

  const fullName = String(formData.get('full_name') ?? '').trim();
  const roleTitle = String(formData.get('role_title') ?? '').trim();
  const shortRole = String(formData.get('short_role') ?? '').trim();
  const subtitle = String(formData.get('subtitle') ?? '').trim();
  const tagline = String(formData.get('tagline') ?? '').trim();
  const executiveSummary = String(formData.get('executive_summary') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const whatsappNumber = String(formData.get('whatsapp_number') ?? '').trim();
  const location = String(formData.get('location') ?? '').trim();
  const calComUrl = String(formData.get('cal_com_url') ?? '').trim();
  const companyName = String(formData.get('company_name') ?? '').trim();
  const companyUrl = String(formData.get('company_url') ?? '').trim();
  const linkedinUrl = String(formData.get('linkedin_url') ?? '').trim();
  const githubUrl = String(formData.get('github_url') ?? '').trim();
  const websiteUrl = String(formData.get('website_url') ?? '').trim();
  const resumePdfUrl = String(formData.get('resume_pdf_url') ?? '/resume.pdf').trim();

  const researchInterests = parseLines(formData.get('research_interests'));
  const softSkills = parseLines(formData.get('soft_skills'));
  const otherSkills = parseLines(formData.get('other_skills'));

  let technicalSkills: Record<string, string[]> | undefined;
  const rawTechSkills = String(formData.get('technical_skills_json') ?? '').trim();
  if (rawTechSkills) {
    try {
      const parsed = JSON.parse(rawTechSkills);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        technicalSkills = parsed;
      }
    } catch {
      // keep existing if JSON invalid
    }
  }

  const updatePayload: Record<string, unknown> = {
    full_name: fullName,
    role_title: roleTitle,
    short_role: shortRole,
    subtitle,
    tagline,
    executive_summary: executiveSummary,
    email,
    phone,
    whatsapp_number: whatsappNumber,
    location,
    cal_com_url: calComUrl,
    company_name: companyName,
    company_url: companyUrl,
    linkedin_url: linkedinUrl,
    github_url: githubUrl,
    website_url: websiteUrl,
    resume_pdf_url: resumePdfUrl,
    research_interests: researchInterests,
    soft_skills: softSkills,
    other_skills: otherSkills,
  };

  if (technicalSkills) {
    updatePayload.technical_skills = technicalSkills;
  }

  const { error } = await admin.from('site_settings').update(updatePayload).eq('id', 'default');
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'cms.site_settings_updated',
    entityType: 'site_settings',
    entityId: null,
    summary: `Updated site profile & resume settings for ${fullName}`,
  });

  revalidatePath('/');
  revalidatePath('/resume');
  revalidatePath('/contact');
  revalidatePath('/admin/resume');
}

export async function upsertResumeItemAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();

  const id = String(formData.get('id') ?? '').trim();
  const section = String(formData.get('section') ?? 'experience').trim();
  const title = String(formData.get('title') ?? '').trim();
  const organization = String(formData.get('organization') ?? '').trim();
  const roleType = String(formData.get('role_type') ?? '').trim() || null;
  const location = String(formData.get('location') ?? '').trim() || null;
  const period = String(formData.get('period') ?? '').trim() || null;
  const badgeLabel = String(formData.get('badge_label') ?? '').trim() || null;
  const verificationUrl = String(formData.get('verification_url') ?? '').trim() || null;
  const highlights = parseLines(formData.get('highlights'));
  const sortOrder = Number(formData.get('sort_order') ?? 10);
  const isVisible = parseFormBoolean(formData, 'is_visible');

  if (!title) return;

  const payload = {
    section,
    title,
    organization,
    role_type: roleType,
    location,
    period,
    badge_label: badgeLabel,
    verification_url: verificationUrl,
    highlights,
    sort_order: sortOrder,
    is_visible: isVisible,
  };

  if (id) {
    const { error } = await admin.from('resume_items').update(payload).eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from('resume_items').insert(payload);
    if (error) throw new Error(error.message);
  }

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: id ? 'cms.resume_item_updated' : 'cms.resume_item_created',
    entityType: 'resume_item',
    entityId: id || null,
    summary: `${id ? 'Updated' : 'Created'} resume ${section} item "${title}"`,
  });

  revalidatePath('/');
  revalidatePath('/resume');
  revalidatePath('/admin/resume');
}

export async function deleteResumeItemAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const { error } = await admin.from('resume_items').delete().eq('id', id);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'cms.resume_item_deleted',
    entityType: 'resume_item',
    entityId: id,
    summary: `Deleted resume item ${id}`,
  });

  revalidatePath('/');
  revalidatePath('/resume');
  revalidatePath('/admin/resume');
}
