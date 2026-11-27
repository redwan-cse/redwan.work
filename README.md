# redwan.work (`v2.1.0`)

Production portfolio, engineering showcase, and full-stack **Client CRM & Delivery Portal** for **Md. Redwan Ahmed** ([redwan.work](https://redwan.work)) — Cyber Security Specialist (EC-Council C|EH, CCEP, CNSP, CAP), Full-Stack Software Engineer, Q1 Scopus Researcher, and Founder & CEO of **Fast Cyber Defense**.

---

## Live Architecture Overview

Built on **Next.js 16 (App Router, Turbopack)**, **React 19**, **TypeScript (strict mode)**, **Tailwind CSS v4**, **Supabase (PostgreSQL 17 + RLS + SSR Auth + `pg_cron`)**, **Cloudflare R2** private/public object storage, **Cloudflare Turnstile**, and **Resend**.

### 1. Public Portfolio, Technical SEO / AEO / GEO & Edge ISR
- **Edge-Cached Public Routes (`revalidate = 300`):** `/`, `/services`, `/services/[slug]`, `/portfolio`, `/portfolio/[slug]`, `/resume`, and `/contact` — full SSR/ISR HTML delivery with isolated query-param syncing (zero `<Suspense>` SSR bailouts on catalogs), direct canonical internal links across all 8 core services in the footer, and deterministic sibling cross-linking on service and case-study detail pages.
- **Unique Service Playbooks & Contextual Technical Dispatches (`lib/seo/service-playbooks.ts`):** Every `/services/[slug]` route renders unique executive methodology, 4 buyer-fit scenarios, a 4-phase delivery workflow, security governance standards, keyword-matched `blogs.redwan.work` articles (`getRelatedBlogPosts`), and service-specific FAQs emitted 1:1 as `FAQPage` JSON-LD alongside `BreadcrumbList` and `Service` schemas.
- **Technical Writing & Blogs (`/blogs`):** Dynamic Google Blogger REST v3 feed (native Node `crypto` JWT signing, zero `googleapis` bundle bloat) with in-memory SWR caching, 2MB-safe compacted Data Cache entries, reading-time estimation, Table of Contents extraction, sanitized plaintext excerpts, HTTP `308` consolidation on `?page=1`, and true HTTP `404` + `noindex` on invalid/out-of-range pagination.
- **Interactive & Printable Web Resume (`/resume`, `/resume.pdf`):** Database-backed CV sections, Cloudflare R2 public-bucket PDF delivery with canonical `Link` header (`rel="canonical"`), and on-demand A4 print rendering.
- **Structured Contact Intake (`/contact`):** Cloudflare Turnstile explicit widget lifecycle (preserving solved unconsumed tokens and surfacing explicit server validation/rate-limit errors), server-enforced active consent policy evidence (`consent_policies` with SHA-256 digest), salted IP rate limiting, encrypted Cloudflare R2 scope attachments, and client-hydrated Live Contract Chat for authenticated clients/admins.
- **SEO, AEO, GEO & Crawl Hygiene:** Dynamic `sitemap.xml` (31 canonical public URLs with CMS mutation revalidation), `robots.txt` with private-surface disallows and AI search crawler rules, `rel="nofollow" prefetch={false}` on all public links targeting private `/portal` or `/register` routes, `/llms.txt` & `/llms-full.txt`, dynamic `1200×630` `next/og` Open Graph PNG routes (`/opengraph-image`, `/services/[slug]/opengraph-image`, `/portfolio/[slug]/opengraph-image`), unified `#person` JSON-LD graph (`WebSite`, `Person`, `ProfessionalService`, `Service` + `OfferCatalog`, `CreativeWork`, `ProfilePage` + deduplicated `ScholarlyArticle`, `ContactPage`, `Blog`, `BreadcrumbList`, `FAQPage`), and automatic `VERCEL_ENV === 'preview'` `noindex`/`disallow` protection.

### 2. Compact 8-Hub Admin Command Portal (`/admin`)
Consolidated around 8 dense workspace hubs plus a global `Ctrl/Cmd+K` Command Palette (`G`-shortcut navigation & live search across orders, clients, invoices, tickets, proposals, and inquiries) with backwards-compatible route aliases:

| Hub | Route | Core Capabilities |
|---|---|---|
| **Overview** | `/admin` | Live KPI strip (`admin_command_center_metrics`), exact-count Needs-Attention queue, SQL-filtered recent client messages |
| **Pipeline** | `/admin/pipeline` | Inquiries inbox with encrypted attachments, Proposals builder with custom milestones & required non-USD FX validation, draft/send lifecycle |
| **Orders** | `/admin/orders` | Dense Table + Kanban board, 5-tab Order Detail (Delivery Vault, Scope/RoE/NDA, Milestones & Task→Progress % sync, Paid Revisions & Cancellations, microsecond-cursor delta-polled Live Contract Chat) |
| **Clients 360°** | `/admin/clients` | Client roster, invitation provisioning/revocation/re-invite lifecycle, strict `role='client'` 6-tab Client 360° profile (CRM, typed notes, orders, billing, tickets/retainers, monotonic `BIGINT` session revocation/deactivation) |
| **Billing** | `/admin/billing` | Multi-line draft/issued/void invoices, payment proof verification with FX lock, manual payments, atomic Credit Notes (`CRN-XXXX`), monthly/quarterly/annual Retainers |
| **Support & Reviews** | `/admin/support` | SLA support tickets with R2 attachments & attachment-isolated internal admin notes, verified client review moderation |
| **Content Studio** | `/admin/content` | Inline tabbed CMS with slide-over edit drawers: Services & Tiers, Portfolio Case Studies, Resume & Profile, Public R2 CDN Assets, Blogger Cache Sync |
| **Security & Ops** | `/admin/ops` | Immutable Audit Log, actionable Email Outbox Queue isolated from Delivery History (inline `after()` drain + `_retryNonce` bulk retry), hardened Private R2 Vault & streaming ZIP Recovery (`/admin/recovery`), Consent Policies & Admin Security |

### 3. Client Portal (`/portal`)
- **Self-Service Workspace:** Overview KPIs (`client_portal_overview`), Package Order & Custom Quote intake (`/portal/orders/new`), Proposal review/accept/decline (`/portal/proposals/[id]`), Order workspace with explicit **NDA** & **Rules of Engagement (RoE)** digital signing, deliverable review/acceptance/paid-revision requests, cancellation requests, and delta-polled Live Contract Chat.
- **Billing, Vault & Security:** Printable A4 invoices with payment proof uploads, SHA-256 verified Encrypted Deliverables Vault (`/portal/files`) with 60-second signed attachment downloads, threaded Support Tickets, Retainers overview, Billing Address management, optional **Client TOTP MFA**, personal audit log, and hardened password management.
- **4-Device Responsive & WCAG 2.2 AA Accessible:** Verified across mobile (`320px`/`375px`), tablet, desktop, and 4K TV (`3840×2160`) viewports in both light and dark modes, with harmonized form typography, keyboard/Escape dialog management, and `prefers-reduced-motion` support.

---

## Security & Database Engineering (`0001`–`0031`)

- **Strict Row Level Security (RLS):** Enabled and matrix-tested across all **37 public PostgreSQL tables** with `initPlan`-cached `(select auth.uid())` checks, consolidated single-permissive policies, and DB-016 PostgREST isolation on `site_settings`.
- **Mandatory Admin AAL2 MFA & Token Revocation:** `public.is_admin()`, `current_account_role()`, `enforce_profile_privileged_columns()`, and `proxy.ts` enforce active admin status + `app_metadata.role = 'admin'` + `aal2` MFA (and optional client MFA), backed by `profiles.tokens_valid_after` epoch revocation checks.
- **Free-Tier Leaked-Password Protection (`lib/auth/hibp.ts`):** Privacy-preserving HaveIBeenPwned `k-anonymity` Range API verification (only the first 5 SHA-1 prefix characters leave the server) plus offline common-breach blocking across signup, password change, recovery, and invite activation.
- **Atomic Financial, RoE & Storage Invariants (`0030`–`0031`):**
  - Server-side catalog pricing (`create_package_order_atomic`), FX rate locks across proposals/orders/retainers/invoices, `$0` issued-invoice prevention, `subtotal_cents = SUM(invoice_items)` verification, overpayment & duplicate-payment blocking, paid-revision addendum isolation, and immutable issued invoices & credit notes.
  - Paid kickoff-deposit + active RoE window/targets/client-match enforcement (`enforce_order_roe_before_progress`, `sign_order_roe_atomic`), sequence-collision DoS prevention on `tickets` and `payments`, and `vault_upload_reservations` concurrent 500 MiB quota locks.
  - Atomic cron outbox & notification enqueuing via Supabase `pg_cron` (`daily_crm_maintenance`) and Vercel Cron (`/api/cron/r2-retention`, `/api/cron/email-outbox`).

---

## What Changed in `v2.1.0`

- **RBAC & Full-Module Functional Remediation (Audit v7, PR #32 — 39 Confirmed Fixes, Zero DB Migration):**
  - **Auth, RBAC & Privacy Boundaries:** Fixed live PostgreSQL `BIGINT` crash on `profiles.tokens_valid_after` during client deactivation/reactivation and invite revocation (preserving monotonic revocation cutoff); enforced `role = 'client'` and self-ban protection on `/admin/clients/[id]`; blocked file attachments on internal admin ticket notes and order chat; redacted admin login email across SSR chat and `/api/contact/active-contracts`; fixed invite revoke/re-invite lifecycle, post-MFA `/invite/accept?session=1` routing, and enforced-MFA client profile UI.
  - **Email Outbox & Admin Hub Integrity:** Isolated `Outbox Queue` to actionable `pending`/`processing`/`failed` rows distinct from `sent` Delivery History, incremented `_retryNonce` on bulk failed-email retries to avoid Resend 24h idempotency collisions, aligned SQL counts across Overview/Pipeline/Billing/Support/Ops hubs, fixed Hub 5/6 tab-preservation, and restored 15+ missing `revalidatePath` calls.
  - **Hardened R2 Vault Recovery & Exports:** Protected pinned (`retention_until = NULL`) deliverables from accidental `+90d` unpinning, made `+90d` retention extension cumulative, excluded active `vault_upload_reservations` and included `contact/` inquiry objects in orphan detection, resolved soft-archive purge deadlocks, fixed streaming ZIP export cancellation race & >200 file truncation notice, externalized `archiver` in `next.config.js`, and enabled `.jpeg`/`.avif` MIME normalization across uploaders.
  - **Live Chat, FX Validation, Explicit Action Errors & Public UX:** Preserved 6-digit PostgreSQL microsecond cursors in order chat delta polling (restoring HTTP `304` + idle backoff), enforced non-USD `fx_rate_to_usd` & milestone total checks, replaced 25+ silent server-action validation `return` no-ops with explicit error feedback, hardened Contact Turnstile token reuse and error display, and fixed client portal attention cards, retainers CTA, expired file badges, and showcase filter resets.
- **Service SEO Depth, Internal Link Graph & Private Link Hygiene (PR #33):**
  - Added unique per-service editorial playbooks (`lib/seo/service-playbooks.ts`) and 1:1 service-specific `FAQPage` JSON-LD on every `/services/[slug]` route to resolve thin/duplicate indexing signals.
  - Added keyword-matched contextual `blogs.redwan.work` article cards (`getRelatedBlogPosts`), deterministic sibling cross-links on `/services/[slug]` and `/portfolio/[slug]`, and direct footer links to all 8 core services.
  - Added `rel="nofollow" prefetch={false}` on all 11 public `<Link>` CTAs targeting private `/portal` or `/register` routes without weakening `robots.txt` or `X-Robots-Tag` protections.
- **Expanded Full-Module SQA Suite:** Grown to **45 test files / 213 automated tests** across 5 isolated suites, adding dedicated unit (`tests/unit/rbac-functional-audit-v7.test.ts`), full-module browser E2E (`tests/e2e/rbac-and-modules-v7.spec.ts` proving R2 Vault Recovery ZIP export, Outbox Queue/Retry, BIGINT client deactivation/revocation, and cross-tenant isolation), and service SEO depth/link-hygiene tests.

---

## What Changed in `v2.0.0`

- **Security & Financial Ledger Hardening (Migrations `0030`–`0031`):** Closed all Phase 1 P0–P1 and Deep Audit v3 findings across authentication/MFA, Zod validation, RLS/RPC actor binding, sequence-collision defenses, RoE gates, FX ledger invariants, and atomic cron outbox flows.
- **Client Portal v3 & Admin Command Center v3:** Added Live Contract Chat with delta polling, 6-tab Client 360°, Content Studio slide-over drawers, Kanban + Table Order views, Retainer renewals, Credit Notes, and structured Consent Policy publishing.
- **Performance & Core Web Vitals Optimization:** Slimmed client bundles, deferred printable resume and heavy modals on demand, compacted Blogger cache payloads safely below Next.js's 2MB Data Cache ceiling, and tuned LCP/CLS/INP.
- **UI/UX, Theme Harmony & Accessibility (Audits v4–v5):** Restored refined theme borders/contrast, unified responsive form typography, fixed WCAG 2.2 AA / 2.5.3 / 2.5.8 touch-target and focus issues across 320px–4K viewports, and verified A4 print styling.
- **Technical & On-Page SEO Overhaul (Audit v6):** Eliminated `/services` and `/portfolio` SSR `<Suspense>` bailouts, wired the internal `/services/[slug]` & `/portfolio/[slug]` link graph, added dynamic `1200×630` `next/og` Open Graph PNGs, unified JSON-LD schemas, enforced HTTP `308`/`404` on `/blogs` pagination, and added Vercel preview `noindex` protection.
- **Next-Gen Fail-Closed SQA Suite:** Expanded to **43 test files / 198 automated tests** across 5 isolated suites (`unit`, `db`, `seo`, `a11y`, `e2e`) with exact-commit machine receipts, `--audit-level=low` dependency auditing, gitleaks scanning, and zero-alert CodeQL (`security-extended`).

---

## Local Development & Quality Verification

### Prerequisites
- Node.js `24.x` (see `.nvmrc`) and npm
- Copy `.env.example` to `.env.local` and configure Supabase, Cloudflare R2, Turnstile, and Resend variables for local development.

### Commands
```bash
npm ci
npm run dev           # Local Next.js dev server
npm run typecheck     # Strict TypeScript check (tsc --noEmit)
npm run lint -- --max-warnings=0
npm run build         # Production Next.js build
```

### Mandatory SQA Quality Gate Suites
All 5 isolated test suites run against disposable loopback fixtures and in-memory PGlite (`0001`–`0031`) with zero production credentials:

```bash
npm run test:unit     # Vitest unit, security, auth, HIBP, CRM, RBAC v7, performance & SEO contract tests (27 files, 143 tests)
npm run test:db       # PGlite full migration bootstrap (0001–0031), 37-table RLS matrix & ledger invariants (11 files, 38 tests)
npm run test:seo      # Playwright metadata, canonical, 308/404 pagination, sitemap (31 URLs), OG PNG, service playbooks & nofollow hygiene (7 tests)
npm run test:a11y     # Playwright + axe-core WCAG 2.2 AA (light/dark), 320px–4K responsive, keyboard & print tests (3 files, 12 tests)
npm run test:e2e      # Playwright full order->deliver->pay, auth/MFA, R2 recovery ZIP, outbox retry & admin CMS/CRM E2E tests (3 files, 13 tests)
node scripts/verify-quality-contract.mjs
```

---

## Documentation & Reference

- [`docs/MASTER_PLAN.md`](./docs/MASTER_PLAN.md) — Core v2 architecture & lifecycle specifications
- [`docs/QUALITY_GATES.md`](./docs/QUALITY_GATES.md) — Mandatory CI/SQA verification & release contract
- [`docs/SEO_AEO_GEO_CHECKLIST.md`](./docs/SEO_AEO_GEO_CHECKLIST.md) — SEO, AEO & GEO implementation checklist
- [`docs/LEGACY_ARCHITECTURE.md`](./docs/LEGACY_ARCHITECTURE.md) — Historical v1 reference ([`redwan-cse/redwan.work_old`](https://github.com/redwan-cse/redwan.work_old))
- [`AGENTS.md`](./AGENTS.md) — Engineering and release-authority guidelines for AI assistants

---

## Security & Licensing

- **Security Policy:** See [`SECURITY.md`](./SECURITY.md) for supported versions, scope, and private vulnerability reporting (`contact@redwan.work`).
- **License & Attribution:** Source-available under the [PolyForm Noncommercial License 1.0.0](./LICENSE). Noncommercial reuse of code snippets, educational study, and contribution are permitted.
  > **Note:** Personal biodata, curriculum vitae / resume (`/resume.pdf`), academic credentials, research publications, certifications, photographs & badges (`public/profile.jpg`, `public/ceh-logo.jpg`, `public/ceh-badge.png`), case studies, and branding belonging to **Md. Redwan Ahmed** and **Fast Cyber Defense** are proprietary (`All Rights Reserved`) and must be removed or replaced before any deployment or publication.
