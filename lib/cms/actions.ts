'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/crm/audit';
import { SERVICE_PILLARS, type ServicePillarKey } from '@/lib/content/site';
import { parseFormBoolean } from '@/lib/forms/boolean';
import {
  RESUME_ASSET_KEY,
  assetUrl,
  isPublicR2Configured,
  putPublicObject,
  validateResumePdfUpload,
} from '@/lib/r2';
import { sanitizeHttpUrl } from '@/lib/security/safe-redirect';

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

  if (!title) throw new Error('Title is required.');
  if (!slug) throw new Error('Provide an ASCII slug or title for the URL.');

  const toolsTagsRaw = formData.get('tools_tags');
  const payload: Record<string, unknown> = {
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
    is_public: isPublic,
    is_featured: isFeatured,
    sort_order: sortOrder,
  };
  if (formData.has('tools_tags')) {
    payload.tools_tags = String(toolsTagsRaw ?? '')
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (!id) {
    payload.tools_tags = highlights;
  }

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
  revalidatePath('/services/[slug]', 'page');
  revalidatePath('/contact');
  revalidatePath('/sitemap.xml');
  revalidatePath('/llms.txt');
  revalidatePath('/llms-full.txt');
  revalidatePath('/portal/orders/new');
  revalidatePath('/admin/services');
  revalidatePath('/admin/content');
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Missing record identifier.');

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
  revalidatePath('/services/[slug]', 'page');
  revalidatePath('/contact');
  revalidatePath('/sitemap.xml');
  revalidatePath('/llms.txt');
  revalidatePath('/llms-full.txt');
  revalidatePath('/portal/orders/new');
  revalidatePath('/admin/services');
  revalidatePath('/admin/content');
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

  if (!serviceId) throw new Error('Missing parent service identifier.');

  const payload: Record<string, unknown> = {
    service_id: serviceId,
    tier_name: tierName,
    package_name: packageName,
    summary,
    price_cents: priceCents,
    delivery_days: deliveryDays,
    revisions_included: revisionsIncluded,
    is_popular: isPopular,
    is_active: isActive,
    features,
    sort_order: sortOrder,
  };
  if (formData.has('deposit_percent') || !id) {
    payload.deposit_percent = depositPercent;
  }

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
  revalidatePath('/services/[slug]', 'page');
  revalidatePath('/contact');
  revalidatePath('/sitemap.xml');
  revalidatePath('/llms.txt');
  revalidatePath('/llms-full.txt');
  revalidatePath('/portal/orders/new');
  revalidatePath('/admin/services');
  revalidatePath('/admin/content');
}

export async function deleteServicePackageAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Missing record identifier.');

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
  revalidatePath('/services/[slug]', 'page');
  revalidatePath('/contact');
  revalidatePath('/sitemap.xml');
  revalidatePath('/llms.txt');
  revalidatePath('/llms-full.txt');
  revalidatePath('/portal/orders/new');
  revalidatePath('/admin/services');
  revalidatePath('/admin/content');
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
  const externalUrl = sanitizeHttpUrl(String(formData.get('external_url') ?? '').trim(), {
    allowRelative: true,
  });
  const sortOrder = Number(formData.get('sort_order') ?? 10);
  const isPublished = parseFormBoolean(formData, 'is_published');
  const isFeatured = parseFormBoolean(formData, 'is_featured');

  if (!title) throw new Error('Title is required.');
  if (!slug) throw new Error('Provide an ASCII slug or title for the URL.');

  const payload: Record<string, unknown> = {
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
    is_published: isPublished,
    is_featured: isFeatured,
    sort_order: sortOrder,
  };
  if (formData.has('external_url') || !id) {
    payload.external_url = externalUrl;
  }

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
  revalidatePath('/portfolio/[slug]', 'page');
  revalidatePath('/sitemap.xml');
  revalidatePath('/llms.txt');
  revalidatePath('/llms-full.txt');
  revalidatePath('/admin/portfolio');
  revalidatePath('/admin/content');
}

export async function deletePortfolioItemAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Missing record identifier.');

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
  revalidatePath('/portfolio/[slug]', 'page');
  revalidatePath('/sitemap.xml');
  revalidatePath('/llms.txt');
  revalidatePath('/llms-full.txt');
  revalidatePath('/admin/portfolio');
  revalidatePath('/admin/content');
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
  const calComUrl =
    sanitizeHttpUrl(String(formData.get('cal_com_url') ?? '').trim(), { allowRelative: true }) ??
    '';
  const companyName = String(formData.get('company_name') ?? '').trim();
  const companyUrl =
    sanitizeHttpUrl(String(formData.get('company_url') ?? '').trim(), { allowRelative: true }) ??
    '';
  const linkedinUrl =
    sanitizeHttpUrl(String(formData.get('linkedin_url') ?? '').trim(), { allowRelative: true }) ??
    '';
  const githubUrl =
    sanitizeHttpUrl(String(formData.get('github_url') ?? '').trim(), { allowRelative: true }) ??
    '';
  const hasWebsiteUrl = formData.has('website_url');
  const websiteUrl = hasWebsiteUrl
    ? (sanitizeHttpUrl(String(formData.get('website_url') ?? '').trim(), { allowRelative: true }) ??
      '')
    : undefined;
  const hasResumePdfUrl = formData.has('resume_pdf_url');
  const rawResumePdfUrl = hasResumePdfUrl ? String(formData.get('resume_pdf_url') ?? '').trim() : undefined;
  const resumePdfUrl =
    rawResumePdfUrl !== undefined
      ? rawResumePdfUrl
        ? sanitizeHttpUrl(rawResumePdfUrl, { allowRelative: true })
        : null
      : undefined;

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
    research_interests: researchInterests,
    soft_skills: softSkills,
    other_skills: otherSkills,
  };

  if (websiteUrl !== undefined) {
    updatePayload.website_url = websiteUrl;
  }

  if (resumePdfUrl !== undefined) {
    updatePayload.resume_pdf_url = resumePdfUrl;
  }

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
  revalidatePath('/resume.pdf');
  revalidatePath('/sitemap.xml');
  revalidatePath('/llms.txt');
  revalidatePath('/llms-full.txt');
  revalidatePath('/contact');
  revalidatePath('/admin/resume');
  revalidatePath('/admin/content');
}

export async function uploadResumePdfAction(formData: FormData): Promise<{
  ok: boolean;
  url?: string;
  size?: number;
  uploadedAt?: string;
  error?: string;
}> {
  try {
    const session = await requireAdmin();
    if (!isPublicR2Configured()) {
      return { ok: false, error: 'Cloudflare R2 public bucket storage is not configured.' };
    }

    const fileEntry = formData.get('resume_pdf');
    if (!(fileEntry instanceof File) || fileEntry.size < 1) {
      return { ok: false, error: 'Please select a PDF file to upload.' };
    }

    const bytes = Buffer.from(await fileEntry.arrayBuffer());
    const validation = validateResumePdfUpload({
      filename: fileEntry.name,
      mime: fileEntry.type,
      size: fileEntry.size,
      bytes,
    });

    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    await putPublicObject(RESUME_ASSET_KEY, bytes, 'application/pdf', {
      contentDisposition: 'attachment; filename="Md_Redwan_Ahmed_Resume.pdf"',
      cacheControl: 'public, max-age=300, must-revalidate',
    });

    const uploadedAt = new Date().toISOString();
    const versionedUrl = `${assetUrl(RESUME_ASSET_KEY)}?v=${Date.now()}`;

    const admin = getSupabaseAdmin();
    const { error: dbError } = await admin
      .from('site_settings')
      .update({ resume_pdf_url: versionedUrl })
      .eq('id', 'default');

    if (dbError) {
      console.error('[cms] resume_pdf_url update failed:', dbError.message);
      return { ok: false, error: 'Uploaded to storage, but failed to update site settings. Please retry.' };
    }

    await recordAuditLog({
      actorId: session.userId,
      actorRole: 'admin',
      action: 'cms.resume_pdf_uploaded',
      entityType: 'site_settings',
      entityId: null,
      summary: `Uploaded resume PDF (${bytes.byteLength} bytes) to R2 public bucket (${RESUME_ASSET_KEY})`,
    });

    revalidatePath('/');
    revalidatePath('/resume');
    revalidatePath('/resume.pdf');
    revalidatePath('/llms.txt');
    revalidatePath('/llms-full.txt');
    revalidatePath('/admin/resume');
    revalidatePath('/admin/content');

    return {
      ok: true,
      url: versionedUrl,
      size: bytes.byteLength,
      uploadedAt,
    };
  } catch (err) {
    if (err instanceof Error && /unauthorized|admin role required/i.test(err.message)) {
      return { ok: false, error: err.message };
    }
    console.error('[cms] uploadResumePdfAction failed:', err instanceof Error ? err.message : err);
    return {
      ok: false,
      error: 'Failed to upload resume PDF to storage.',
    };
  }
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
  const verificationUrl = sanitizeHttpUrl(String(formData.get('verification_url') ?? '').trim(), {
    allowRelative: true,
  });
  const highlights = parseLines(formData.get('highlights'));
  const sortOrder = Number(formData.get('sort_order') ?? 10);
  const isVisible = parseFormBoolean(formData, 'is_visible');

  if (!title) throw new Error('Resume item title is required.');

  const description = String(formData.get('description') ?? '').trim() || null;
  const payload: Record<string, unknown> = {
    section,
    title,
    organization,
    highlights,
    sort_order: sortOrder,
    is_visible: isVisible,
  };
  if (formData.has('role_type') || !id) payload.role_type = roleType;
  if (formData.has('location') || !id) payload.location = location;
  if (formData.has('period') || !id) payload.period = period;
  if (formData.has('description') || !id) payload.description = description;
  if (formData.has('badge_label') || !id) payload.badge_label = badgeLabel;
  if (formData.has('verification_url') || !id) payload.verification_url = verificationUrl;

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
  revalidatePath('/resume.pdf');
  revalidatePath('/sitemap.xml');
  revalidatePath('/llms.txt');
  revalidatePath('/llms-full.txt');
  revalidatePath('/admin/resume');
  revalidatePath('/admin/content');
}

export async function deleteResumeItemAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const admin = getSupabaseAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Missing record identifier.');

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
  revalidatePath('/resume.pdf');
  revalidatePath('/sitemap.xml');
  revalidatePath('/llms.txt');
  revalidatePath('/llms-full.txt');
  revalidatePath('/admin/resume');
  revalidatePath('/admin/content');
}
