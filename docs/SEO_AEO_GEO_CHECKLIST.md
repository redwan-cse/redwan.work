# SEO, AEO & GEO Implementation & Gap Tracker (`redwan.work`)

> Living operational checklist tracking technical SEO, Answer Engine Optimization (AEO), Generative Engine Optimization (GEO), analytics telemetry, and external search-engine verification for **https://redwan.work**.
>
> **Status legend:** `[x]` Implemented & verified in repo · `[ ]` Remaining manual setup or next-phase enhancement

---

## 1. Analytics, Heatmaps & Privacy Compliance

- [x] **Google Analytics 4 (`G-4DPLP68YNS`)** wired on public marketing routes only (`components/analytics-scripts.tsx` via `components/marketing-frame.tsx`; excluded from `/portal`, `/admin`, `/login`, `/mfa`).
- [x] **Microsoft Clarity (`zdjlpn8rok`)** wired on public marketing routes only (`components/analytics-scripts.tsx`), including `clarity('consentv2', ...)` API integration.
- [x] **Google Consent Mode v2 & Privacy Controls** synchronized with `components/cookie-preferences.tsx` (`ad_storage: 'denied'`, `ad_user_data: 'denied'`, `ad_personalization: 'denied'` globally; `analytics_storage` defaults `denied` and updates live when the visitor opts in via **Accept & Continue** or toggles **Analytics & UX Telemetry**).
- [x] **Content-Security-Policy (CSP)** updated in `next.config.js` to allow `googletagmanager.com`, `google-analytics.com`, `clarity.ms`, and `c.bing.com` while blocking untrusted origins.
- [x] **Privacy Notice & Automated Test Isolation**: `/privacy#cookies` updated accurately; `navigator.webdriver === true` skips external GA4/Clarity calls during Playwright tests.
- [ ] **Vercel Production Env Parity**: Add `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-4DPLP68YNS` and `NEXT_PUBLIC_CLARITY_PROJECT_ID=zdjlpn8rok` to Vercel **Production** environment variables (`Settings → Environment Variables`) and trigger a fresh production deploy (`NEXT_PUBLIC_*` vars are baked in at build time).
- [ ] **Live Ping Verification (Post-Deploy)**:
  - Open `https://redwan.work` in an incognito browser, click **Accept & Continue**, and inspect DevTools Network tab for `200/204` beacons to `www.google-analytics.com/g/collect` and `clarity.ms`.
  - Confirm **Google Analytics 4 → Reports → Realtime** shows active user traffic.
  - Confirm **Microsoft Clarity → Project (`zdjlpn8rok`) → Recordings/Setup** reports **Verified / Receiving Data** and keep **Masking: Strict** enabled so `/contact` user inputs are masked.

---

## 2. Webmaster Consoles & Indexing Pipelines (External Manual Steps)

- [ ] **Google Search Console (GSC) Verification**:
  - Recommended: Add Domain property `redwan.work` in GSC using the Cloudflare DNS `TXT` record (`google-site-verification=...`), OR set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` in Vercel + `.env.local` (meta tag emission is already built into `app/layout.tsx` via `resolveSiteVerificationMetadata()`).
- [ ] **Submit Sitemap in GSC**: Submit `https://redwan.work/sitemap.xml` under **GSC → Sitemaps** and run **URL Inspection → Request Indexing** on `/`, `/services`, `/portfolio`, `/resume`, and `/blogs`.
- [ ] **Link GSC ↔ GA4**: In **GA4 Admin → Product Links → Search Console Links**, connect `redwan.work` GSC property to stream `G-4DPLP68YNS` so Search Console queries & CTR appear inside GA4.
- [ ] **Bing Webmaster Tools Import**: Sign into [Bing Webmasters](https://www.bing.com/webmasters) and click **Import from Google Search Console** (auto-verifies domain & imports `sitemap.xml`), OR set `NEXT_PUBLIC_BING_SITE_VERIFICATION` (`msvalidate.01`). *(Crucial for Bing Search, Copilot, and ChatGPT Search discovery.)*
- [ ] **Link GA4 → Microsoft Clarity**: In **Clarity → Setup → Google Analytics Integration**, connect `G-4DPLP68YNS`.
- [ ] **External `robots.txt` & `sitemap` Check on `blogs.redwan.work`**: Verify `https://blogs.redwan.work/robots.txt` allows Googlebot/Bingbot/OAI-SearchBot/PerplexityBot and submits its own Blogger sitemap to the same Domain GSC property.

---

## 3. Technical SEO (Google & Bing Ranking Signals)

- [x] **Unique Titles, Descriptions, Self-Referencing Canonicals & OpenGraph URLs** across all 8 indexable routes (`/`, `/services`, `/portfolio`, `/blogs`, `/resume`, `/contact`, `/privacy`, `/tos`).
- [x] **Deterministic `sitemap.xml`** (`app/sitemap.ts`) pulling real CMS `updated_at` timestamps with zero wall-clock drift.
- [x] **Strict Private Route Protection**: `/admin`, `/portal`, `/login`, `/register`, `/mfa`, `/reset-password`, `/invite`, and `/api/*` emit `X-Robots-Tag: noindex, nofollow` and are disallowed in `robots.txt`.
- [x] **BreadcrumbList JSON-LD** across `/services`, `/portfolio`, `/blogs`, `/resume`, `/contact`, `/privacy`, and `/tos`.
- [x] **Schema.org `Service` + `OfferCatalog` (`/services`)**, **`CollectionPage` (`/portfolio`)**, **`ProfilePage` + `ScholarlyArticle` (`/resume`)**, and **`Blog` + `BlogPosting` (`/blogs`)** (`lib/seo/structured-data.ts`).
- [ ] **Next-Phase Growth Gap — Dedicated SEO Landing Pages (`/services/[slug]` & `/portfolio/[slug]`)**: Right now all 5 service pillars and all portfolio items live on tabbed `/services` and `/portfolio` pages. Creating dedicated indexable URLs (e.g. `/services/vapt-penetration-testing`, `/services/wazuh-siem-hardening`, `/portfolio/fast-cyber-defense-platform`) + adding them to `sitemap.ts` will target long-tail commercial keywords individually without competing on one page.
- [ ] **Next-Phase Growth Gap — Dynamic Social/OG Images (`app/opengraph-image.tsx`)**: Generate route-specific `1200×630` PNG OpenGraph cards (currently all pages share `800×800` `/profile.jpg`).
- [ ] **Next-Phase Growth Gap — Core Web Vitals & PageSpeed Audit**: After Vercel deploy, run [PageSpeed Insights](https://pagespeed.web.dev/) on `/`, `/services`, and `/blogs` on mobile 4G throttling and tune LCP/CLS/INP if any score is `< 95`.
- [ ] **Next-Phase Growth Gap — Bing IndexNow Integration (`/api/indexnow`)**: Host an IndexNow key file (`/<key>.txt`) and trigger IndexNow pings from `/api/revalidate` so Bing, Copilot, and ChatGPT Search re-crawl within minutes whenever CMS services or Blogger articles update.

---

## 4. AEO (Featured Snippets, People Also Ask, AI Overviews & Voice)

- [x] **`FAQPage` JSON-LD + Visible Semantic FAQ Accordion (`#faq`)** on `/services` (`components/faq-section.tsx`) with concise 40–60 word direct answers on VAPT/RoE, full-stack/cloud scope, milestone billing, private R2 vault retention, and verified credentials.
- [x] **Crawlable Native `<details>` Markup** ensuring all 5 Q&A answers exist in raw SSR HTML without JS hydration dependency.
- [ ] **Next-Phase Growth Gap — Pillar-Specific FAQ Blocks**: Add targeted 3-question FAQs directly inside future dedicated service pages (e.g. *"How long does a web application pentest take?"*, *"What is the cost of Wazuh SIEM deployment?"*).
- [ ] **Next-Phase Growth Gap — `blogs.redwan.work` Answer-First Lead Paragraphs**: Add a crisp 45-word *"Quick Answer / Executive Summary"* box at the top of technical tutorials on `blogs.redwan.work` directly above the Table of Contents.

---

## 5. GEO (ChatGPT Search, Perplexity, Claude & Gemini Citations)

- [x] **`/llms.txt` (`llmstxt.org` standard)**: Live Markdown endpoint (`app/llms.txt/route.ts`) summarizing identity, EC-Council C|EH (`#ECC8126370954`), Fast Cyber Defense, Elsevier Q1 Scopus DOI (`10.1016/j.ijcce.2024.04.002`), IEEE 2024 paper, starting package prices, and top case studies.
- [x] **`/llms-full.txt`**: Complete live Markdown knowledge dump (`app/llms-full.txt/route.ts`) including full package tiers, deposit terms, portfolio outcomes/stacks, CV timeline, FAQs, and latest 10 live blog summaries.
- [x] **HTML `<link rel="alternate" type="text/markdown" href="https://redwan.work/llms.txt">`** advertised in `<head>` of `app/layout.tsx`.
- [x] **Explicit AI Crawler Rules (`app/robots.ts`)**: Permits `OAI-SearchBot`, `GPTBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `anthropic-ai`, `Google-Extended`, `Applebot-Extended`, `Bingbot`, and `Googlebot` across public routes and `/llms*.txt` while blocking private/portal/admin routes.
- [x] **Enriched Entity Knowledge `@graph` (`lib/seo/structured-data.ts`)**: Links `WebSite`, `Person` (`hasCredential`, `alumniOf`, `knowsAbout`, `sameAs`), `ProfessionalService`, and verified research citations via stable `@id` URIs.
- [ ] **Next-Phase Growth Gap — Author Entity Authority & Off-Site Co-Citations**:
  - Ensure GitHub (`github.com/redwan-cse`), LinkedIn (`linkedin.com/in/redwancse`), Fast Cyber Defense (`fastcyberdefense.com`), and `blogs.redwan.work` all explicitly link back to **`https://redwan.work`** (bi-directional `sameAs` verification strengthens Google Knowledge Graph & LLM entity confidence).
  - Add your own Google Scholar author profile URL / ORCID iD to `SITE.socials` once published so `sameAs` connects academic citations directly to `#person`.
- [ ] **Next-Phase Growth Gap — Monthly AI Brand Prompt Audit**: Test monthly prompts across **ChatGPT Search**, **Perplexity**, **Claude**, and **Google AI Overviews** (e.g., *"Who is Md. Redwan Ahmed cybersecurity consultant?"*, *"Recommended freelance penetration tester in Bangladesh with C|EH and Q1 Scopus research"*, *"Fast Cyber Defense founder"*) and track citation accuracy & referral traffic in GA4.
