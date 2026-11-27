# SEO, AEO & GEO Implementation & Gap Tracker (`redwan.work`)

> Living operational checklist tracking technical SEO, Answer Engine Optimization (AEO), Generative Engine Optimization (GEO), analytics telemetry, and external search-engine verification for **https://redwan.work**.
>
> **Status legend:** `[x]` Implemented & verified in repo · `[ ]` Remaining manual setup or next-phase enhancement

---

## 1. Analytics, Heatmaps & Privacy Compliance

- [x] **Google Analytics 4 (`G-4DPLP68YNS`)** wired on public marketing routes only (`components/analytics-scripts.tsx` via `components/marketing-frame.tsx`; excluded from `/portal`, `/admin`, `/login`, `/mfa`).
- [x] **Microsoft Clarity (`zdjlpn8rok`)** wired on public marketing routes only (`components/analytics-scripts.tsx`), including `clarity('consentv2', ...)` API integration.
- [x] **Google Consent Mode v2 & First-Visit Privacy Controls** synchronized with `components/cookie-preferences.tsx`: **Site Experience & Preloading** and **Analytics & UX Telemetry** are enabled by default and shown immediately on first visit so visitors can keep or disable any optional option (`ad_storage: 'denied'`, `ad_user_data: 'denied'`, `ad_personalization: 'denied'` globally; opting out via **Essential Only** or toggling telemetry OFF immediately updates GA4 `analytics_storage: 'denied'` and `clarity('consentv2', ...)`).
- [x] **Content-Security-Policy (CSP)** updated in `next.config.js` to allow `googletagmanager.com`, `google-analytics.com`, `clarity.ms`, and `c.bing.com` while blocking untrusted origins.
- [x] **Privacy Notice & Automated Test Isolation**: `/privacy#cookies` updated accurately; `navigator.webdriver === true` skips external GA4/Clarity calls during Playwright tests.
- [x] **Vercel Production Env Parity**: `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-4DPLP68YNS` and `NEXT_PUBLIC_CLARITY_PROJECT_ID=zdjlpn8rok` configured in Vercel **Production** environment variables (`Settings → Environment Variables`). *(Remember to deploy the latest `main` push so `NEXT_PUBLIC_*` vars and new telemetry scripts are bundled into production.)*
- [ ] **Live Ping Verification (Post-Deploy)**:
  - Open `https://redwan.work` in an incognito browser: the **Privacy & Storage Notice** should open with **Site Experience & Preloading** and **Analytics & UX Telemetry** enabled by default, and DevTools Network tab should show `200`/`204` beacons to `www.google-analytics.com/g/collect` and `clarity.ms`.
  - Confirm **Google Analytics 4 → Reports → Realtime** shows active user traffic.
  - Confirm **Microsoft Clarity → Project (`zdjlpn8rok`) → Recordings/Setup** reports **Verified / Receiving Data** and keep **Masking: Strict** enabled so `/contact` user inputs are masked.

---

## 2. Webmaster Consoles & Indexing Pipelines (External Manual Steps)

- [x] **Google Search Console (GSC) Verification**: Domain property `redwan.work` verified in Google Search Console.
- [x] **Submit Sitemap in GSC**: `https://redwan.work/sitemap.xml` submitted under **GSC → Sitemaps** (`Success`, all 8 public routes discovered), alongside `blogs.redwan.work` feeds (`atom.xml` & `sitemap-pages.xml`).
- [ ] **Link GSC ↔ GA4**: In **GA4 Admin → Product Links → Search Console Links**, connect `redwan.work` GSC property to stream `G-4DPLP68YNS` so Search Console queries & CTR appear inside GA4.
- [x] **Bing Webmaster Tools Import**: `https://redwan.work/sitemap.xml` and `blogs.redwan.work` sitemaps submitted & verified in Bing Webmasters (`Success`, 172 total URLs discovered, 0 errors).
- [ ] **Link GA4 → Microsoft Clarity**: In **Clarity → Setup → Google Analytics Integration**, connect `G-4DPLP68YNS`.
- [x] **External `robots.txt` & `sitemap` Check on `blogs.redwan.work`**: `blogs.redwan.work` sitemaps verified and indexed in Google Search Console and Bing Webmaster Tools.

---

## 3. Technical SEO (Google & Bing Ranking Signals)

- [x] **Unique Titles, Descriptions, Self-Referencing Canonicals & OpenGraph URLs** across all 8 indexable routes (`/`, `/services`, `/portfolio`, `/blogs`, `/resume`, `/contact`, `/privacy`, `/tos`).
- [x] **Deterministic `sitemap.xml`** (`app/sitemap.ts`) with zero wall-clock drift: `/`, `/services`, `/portfolio`, `/resume`, and `/contact` use CMS `updated_at` timestamps; `/blogs` tracks the newest Blogger post timestamp; `/privacy` and `/tos` use `FALLBACK_LAST_MODIFIED`.
- [x] **Strict Private Route Protection**: `/admin`, `/portal`, `/login`, `/register`, `/mfa`, `/reset-password`, `/invite`, and `/api/*` emit `X-Robots-Tag: noindex, nofollow` and are disallowed in `robots.txt`.
- [x] **BreadcrumbList JSON-LD** across `/services`, `/portfolio`, `/blogs`, `/resume`, `/contact`, `/privacy`, and `/tos`.
- [x] **Schema.org `Service` + `OfferCatalog` (`/services`)**, **`CollectionPage` (`/portfolio`)**, **`ProfilePage` + `ScholarlyArticle` (`/resume`)**, and **`Blog` + `BlogPosting` (`/blogs`)** (`lib/seo/structured-data.ts`).
- [x] **R2 Public Bucket Resume PDF & Admin Upload Manager (`https://cdn.redwan.work/assets/resume/Md_Redwan_Ahmed_Resume.pdf` & `/resume.pdf`)**: Pre-formatted resume PDF stored in the Cloudflare R2 public bucket (`assets/resume/Md_Redwan_Ahmed_Resume.pdf`), linked in `site_settings.resume_pdf_url`, served with canonical `Link` header (`rel="canonical"`), and replaceable any time from `/admin/resume` (`components/admin/resume-pdf-manager.tsx`) without runtime PDF generation or committing `public/resume.pdf` into Git.
- [x] **Dedicated SEO Landing Pages (`/services/[slug]` & `/portfolio/[slug]`) & Full Internal Link Graph (`v2.0.0` PR #30 & `v2.1.0` PR #33)**: Dedicated indexable SSG/ISR URLs included in `sitemap.xml` (31 canonical public URLs), zero `<Suspense>` SSR bailouts on catalogs, unique per-service editorial playbooks (`lib/seo/service-playbooks.ts`), keyword-matched `blogs.redwan.work` article cards, deterministic sibling cross-links on every service and case study page, and all 8 live core services linked site-wide in `components/footer.tsx`.
- [x] **Private Link Crawl & Prefetch Hygiene (`v2.1.0` PR #33)**: All 11 public `<Link>` CTAs targeting private `/portal` or `/register` routes carry `rel="nofollow" prefetch={false}` (enforced by unit + Playwright SEO tests), eliminating anonymous `307 -> /login` RSC prefetches and crawler discovery noise while keeping `/portal`, `/admin`, and auth routes protected by `robots.txt` + `X-Robots-Tag: noindex, nofollow`.
- [x] **Dynamic Social/OG Images & `summary_large_image` (`v2.0.0` PR #30)**: Dynamic `1200×630` `next/og` PNG cards at `/opengraph-image`, `/services/[slug]/opengraph-image`, and `/portfolio/[slug]/opengraph-image` with `twitter.card: 'summary_large_image'`, deduplicated brand titles, HTTP `308`/`404` blog pagination canonicalization, and `VERCEL_ENV === 'preview'` automatic `noindex`/`disallow` protection.
- [x] **Edge ISR Caching on Public Routes (`v2.0.0` PR #30)**: `/`, `/services`, `/services/[slug]`, `/portfolio`, `/portfolio/[slug]`, `/resume`, and `/contact` use `revalidate = 300` ISR with explicit `revalidatePath` calls across CMS mutations (including `/sitemap.xml` and `/llms*.txt`).
- [ ] **Next-Phase Growth Gap — Core Web Vitals & PageSpeed Audit**: After Vercel deploy, run [PageSpeed Insights](https://pagespeed.web.dev/) on `/`, `/services`, `/services/siem-security-monitoring`, and `/blogs` on mobile 4G throttling and tune LCP/CLS/INP if any score is `< 95`.
- [ ] **Next-Phase Growth Gap — Bing IndexNow Integration (`/api/indexnow`)**: Host an IndexNow key file (`/<key>.txt`) and trigger IndexNow pings from `/api/revalidate` so Bing, Copilot, and ChatGPT Search re-crawl within minutes whenever CMS services or Blogger articles update.

---

## 4. AEO (Featured Snippets, People Also Ask, AI Overviews & Voice)

- [x] **`FAQPage` JSON-LD + Visible Semantic FAQ Accordion (`#faq`)** on `/services` (`components/faq-section.tsx`) with concise ~33–39 word direct answers on VAPT/RoE, full-stack/cloud scope, milestone billing, private R2 vault retention, and verified credentials.
- [x] **Crawlable Native `<details>` Markup** ensuring all Q&A answers exist in raw SSR HTML without JS hydration dependency.
- [x] **Service-Specific FAQ Blocks & `FAQPage` Schemas (`v2.1.0` PR #33)**: Every `/services/[slug]` route renders 3–4 unique, non-duplicate service-specific FAQs (`lib/seo/service-playbooks.ts`) matched 1:1 with `buildFaqPageJsonLd(playbook.faqs)` alongside `BreadcrumbList` and `Service` JSON-LD.
- [ ] **Next-Phase Growth Gap — `blogs.redwan.work` Answer-First Lead Paragraphs**: Add a crisp 45-word *"Quick Answer / Executive Summary"* box at the top of technical tutorials on `blogs.redwan.work` directly above the Table of Contents.

---

## 5. GEO (ChatGPT Search, Perplexity, Claude & Gemini Citations)

- [x] **`/llms.txt` (`llmstxt.org` standard)**: Live Markdown endpoint (`app/llms.txt/route.ts`) summarizing identity, EC-Council C|EH (`#ECC8126370954`), Fast Cyber Defense, Elsevier Q1 Scopus DOI (`10.1016/j.ijcce.2024.04.002`), IEEE 2024 paper, starting package prices, and top case studies.
- [x] **`/llms-full.txt`**: Complete live Markdown knowledge dump (`app/llms-full.txt/route.ts`) including full package tiers, deposit terms, portfolio outcomes/stacks, CV timeline, FAQs, and latest 10 live blog summaries.
- [x] **HTML `<link rel="alternate" type="text/markdown" href="https://redwan.work/llms.txt">`** advertised in `<head>` of `app/layout.tsx`.
- [x] **Explicit AI Crawler Rules (`app/robots.ts`)**: Permits `OAI-SearchBot`, `GPTBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `anthropic-ai`, `Google-Extended`, `Applebot-Extended`, `Bingbot`, and `Googlebot` across public routes and `/llms*.txt` while blocking private/portal/admin routes.
- [x] **Enriched Entity Knowledge `@graph` (`lib/seo/structured-data.ts`)**: Links `WebSite` (`name: "Md. Redwan Ahmed"` + `alternateName` variants), `Person` (`description`, `identifier` with ORCID `0009-0001-9419-4760`, `hasCredential`, `alumniOf`, `knowsAbout`, and personal-only `sameAs`), `ProfessionalService`, and verified research citations via stable `@id` URIs.
- [x] **Author Entity Authority & Academic Profiles (`SITE.socials`, `components/social-links.tsx`, `/resume`, `/llms*.txt`)**:
  - Connected Google Scholar (`https://scholar.google.com/citations?user=QKjhR4wAAAAJ&hl=en`), ORCID (`https://orcid.org/0009-0001-9419-4760`), GitHub, LinkedIn, Upwork, Fiverr, X (`x.com/redwancse`), Facebook, Instagram, and `blogs.redwan.work` across `Person.sameAs`, `rel="me"` footer icons (theme-matched), `/resume` header pills, and `/llms*.txt`. *(Keep personal profiles and `blogs.redwan.work` linking back to `https://redwan.work`; `fastcyberdefense.com` is intentionally excluded from personal backlinks as a multi-shareholder startup.)*
- [x] **Robots tokens refreshed (`app/robots.ts`)**: added `Claude-SearchBot`, `Claude-User`, and `Perplexity-User` (note `Google-Extended`/`Applebot-Extended` are control tokens, not crawlers); covered by unit + SEO tests.
- [ ] **Next-Phase Growth Gap — Entity & off-site authority**: Create/claim a Google Business Profile (if service-area eligible), a Wikidata item (only if notability sources exist), and earn genuine backlinks (guest posts, Scholar/ORCID, GitHub READMEs). Do **not** add `Review`/`AggregateRating` schema without real, verifiable reviews.
- [x] **Minor cleanups**: removed the no-op `anonymize_ip` from the GA4 config call, and updated `/blogs` `lastModified` in `app/sitemap.ts` to track the newest Blogger post.
- [ ] **Next-Phase Growth Gap — Monthly AI Brand Prompt Audit**: Test monthly prompts across **ChatGPT Search**, **Perplexity**, **Claude**, and **Google AI Overviews** (e.g., *"Who is Md. Redwan Ahmed cybersecurity consultant?"*, *"Recommended freelance penetration tester in Bangladesh with C|EH and Q1 Scopus research"*, *"Fast Cyber Defense founder"*) and track citation accuracy & referral traffic in GA4.
