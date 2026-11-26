# redwan.work (`v2.0.0`)

Production portfolio, engineering showcase, and full-stack **Client CRM & Delivery Portal** for **Md. Redwan Ahmed** ([redwan.work](https://redwan.work)) — Cyber Security Specialist (EC-Council C|EH, CCEP, CNSP, CAP), Full-Stack Software Engineer, Q1 Scopus Researcher, and Founder & CEO of **Fast Cyber Defense**.

---

## Live Architecture Overview

Built on **Next.js 16 (App Router, Turbopack)**, **React 19**, **TypeScript (strict mode)**, **Tailwind CSS v4**, **Supabase (PostgreSQL 17 + RLS + SSR Auth + `pg_cron`)**, **Cloudflare R2** private/public object storage, **Cloudflare Turnstile**, and **Resend**.

### 1. Public Portfolio, Technical SEO / AEO / GEO & Edge ISR
- **Edge-Cached Public Routes (`revalidate = 300`):** `/`, `/services`, `/services/[slug]`, `/portfolio`, `/portfolio/[slug]`, `/resume`, and `/contact` — full SSR/ISR HTML delivery with isolated query-param syncing (zero `<Suspense>` SSR bailouts on catalogs) and direct canonical internal links across all service and case-study slugs.
- **Technical Writing & Blogs (`/blogs`):** Dynamic Google Blogger REST v3 feed (native Node `crypto` JWT signing, zero `googleapis` bundle bloat) with in-memory SWR caching, 2MB-safe compacted Data Cache entries, reading-time estimation, Table of Contents extraction, sanitized plaintext excerpts, HTTP `308` consolidation on `?page=1`, and true HTTP `404` + `noindex` on invalid/out-of-range pagination.
- **Interactive & Printable Web Resume (`/resume`, `/resume.pdf`):** Database-backed CV sections, Cloudflare R2 public-bucket PDF delivery with canonical `Link` header (`rel="canonical"`), and on-demand A4 print rendering.
- **Structured Contact Intake (`/contact`):** Cloudflare Turnstile explicit widget lifecycle, server-enforced active consent policy evidence (`consent_policies` with SHA-256 digest), salted IP rate limiting, encrypted Cloudflare R2 scope attachments, and client-hydrated Live Contract Chat for authenticated clients/admins.
- **SEO, AEO & GEO Ready:** Dynamic `sitemap.xml` (31 canonical public URLs with CMS mutation revalidation), `robots.txt` with private-surface disallows and AI search crawler rules, `/llms.txt` & `/llms-full.txt`, dynamic `1200×630` `next/og` Open Graph PNG routes (`/opengraph-image`, `/services/[slug]/opengraph-image`, `/portfolio/[slug]/opengraph-image`), unified `#person` JSON-LD graph (`WebSite`, `Person`, `ProfessionalService`, `Service` + `OfferCatalog`, `CreativeWork`, `ProfilePage` + deduplicated `ScholarlyArticle`, `ContactPage`, `Blog`, `BreadcrumbList`, `FAQPage`), and automatic `VERCEL_ENV === 'preview'` `noindex`/`disallow` protection.

### 2. Compact 8-Hub Admin Command Portal (`/admin`)
Consolidated around 8 dense workspace hubs plus a global `Ctrl/Cmd+K` Command Palette (`G`-shortcut navigation & live search across orders, clients, invoices, tickets, proposals, and inquiries) with backwards-compatible route aliases:

| Hub | Route | Core Capabilities |
|---|---|---|
| **Overview** | `/admin` | Live KPI strip (`admin_command_center_metrics`), Needs-Attention queue, recent activity |
| **Pipeline** | `/admin/pipeline` | Inquiries inbox with encrypted attachments, Proposals builder with custom milestones, draft/send lifecycle |
| **Orders** | `/admin/orders` | Dense Table + Kanban board, 5-tab Order Detail (Delivery Vault, Scope/RoE/NDA, Milestones & Task→Progress % sync, Paid Revisions & Cancellations, delta-polled Live Contract Chat) |
| **Clients 360°** | `/admin/clients` | Client roster, invitation provisioning, 6-tab Client 360° profile (CRM, typed notes, orders, billing, tickets/retainers, security/deactivation) |
| **Billing** | `/admin/billing` | Multi-line draft/issued/void invoices, payment proof verification with FX lock, manual payments, atomic Credit Notes (`CRN-XXXX`), monthly/quarterly/annual Retainers |
| **Support & Reviews** | `/admin/support` | SLA support tickets with R2 attachments & internal notes, verified client review moderation |
| **Content Studio** | `/admin/content` | Inline tabbed CMS with slide-over edit drawers: Services & Tiers, Portfolio Case Studies, Resume & Profile, Public R2 CDN Assets, Blogger Cache Sync |
| **Security & Ops** | `/admin/ops` | Immutable Audit Log, Email Outbox & Resend monitor (inline `after()` drain + retry), Private R2 Vault & Recovery ZIP exports, Consent Policies & Admin Security |

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
npm run test:unit     # Vitest unit, security, auth, HIBP, CRM, performance & SEO contract tests (26 files)
npm run test:db       # PGlite full migration bootstrap (0001–0031), 37-table RLS matrix & ledger invariants (11 files)
npm run test:seo      # Playwright metadata, canonical, 308/404 pagination, sitemap (31 URLs), OG PNG & AEO/GEO tests
npm run test:a11y     # Playwright + axe-core WCAG 2.2 AA (light/dark), 320px–4K responsive, keyboard & print tests
npm run test:e2e      # Playwright full order->deliver->pay, auth/MFA, vault retention & admin CMS/CRM E2E tests
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
