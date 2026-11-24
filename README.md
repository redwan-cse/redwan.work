# redwan.work (`v1.0.0`)

Production portfolio, engineering showcase, and full-stack **Client CRM & Delivery Portal** for **Md. Redwan Ahmed** ([redwan.work](https://redwan.work)) — Cyber Security Specialist (EC-Council C|EH) & Full-Stack Software Engineer, Founder & Lead Security Consultant at **Fast Cyber Defense**.

---

## Live Architecture Overview

Built on **Next.js 16 (App Router, Turbopack)**, **TypeScript (strict mode)**, **Tailwind CSS v4**, **Supabase (PostgreSQL 17 + RLS + SSR Auth + `pg_cron`)**, and **Cloudflare R2** private/public object storage.

### 1. Public Portfolio, SEO/AEO/GEO & Edge ISR
- **Edge-Cached Public Routes (`revalidate = 300`):** `/`, `/services`, `/services/[slug]`, `/portfolio`, `/portfolio/[slug]`, `/resume`, and `/contact`.
- **Technical Writing & Blogs (`/blogs`):** Dynamic Google Blogger v3 feed with in-memory SWR caching, reading-time calculation, Table of Contents extraction, and sanitized plaintext excerpts.
- **Interactive & Printable Web Resume (`/resume`, `/resume.pdf`):** Database-backed CV sections, Cloudflare R2 hosted PDF delivery, and print-ready resume view.
- **Structured Contact Intake (`/contact`):** Cloudflare Turnstile protection, server-enforced active consent policy evidence (`consent_policies`), IP rate limiting, encrypted Cloudflare R2 scope attachments, and client-hydrated Live Contract Chat for authenticated clients/admins.
- **SEO, AEO & GEO Ready:** Dynamic `sitemap.xml` (31 canonical public URLs), `robots.txt` with private-surface disallows, `/llms.txt` & `/llms-full.txt`, and structured JSON-LD (`Person`, `WebSite`, `Service`, `CreativeWork`, `BreadcrumbList`, `FAQPage`).

### 2. Compact 8-Hub Admin Command Portal (`/admin`)
Consolidated around 8 dense workspace hubs plus a global `Ctrl/Cmd+K` Command Palette (`G`-shortcut navigation & live search across orders, clients, invoices, tickets, proposals, and inquiries) with backwards-compatible route aliases:

| Hub | Route | Core Capabilities |
|---|---|---|
| **Overview** | `/admin` | Live KPI strip (`admin_command_center_metrics`), Needs-Attention queue, recent activity |
| **Pipeline** | `/admin/pipeline` | Inquiries inbox with encrypted attachments, Proposals builder with custom milestones, draft/send lifecycle |
| **Orders** | `/admin/orders` | Dense Table + Kanban board, 5-tab Order Detail (Delivery Vault, Scope/RoE/NDA, Milestones & Task->Progress % sync, Paid Revisions & Cancellations, Live Contract Chat) |
| **Clients 360°** | `/admin/clients` | Client roster, invitation provisioning, 6-tab Client 360° profile (CRM, typed notes, orders, billing, tickets/retainers, security/deactivation) |
| **Billing** | `/admin/billing` | Multi-line draft/issued/void invoices, payment proof verification with FX lock, manual payments, atomic Credit Notes (`CRN-XXXX`), monthly/quarterly/annual Retainers |
| **Support & Reviews** | `/admin/support` | SLA support tickets with R2 attachments & internal notes, verified client review moderation |
| **Content Studio** | `/admin/content` | Inline tabbed CMS with slide-over edit drawers: Services & Tiers, Portfolio Case Studies, Resume & Profile, Public R2 CDN Assets, Blogger Cache Sync |
| **Security & Ops** | `/admin/ops` | Immutable Audit Log, Email Outbox & Resend monitor (inline `after()` drain + retry), Private R2 Vault & Recovery ZIP exports, Consent Policies & Admin Security |

### 3. Client Portal (`/portal`)
- **Self-Service Workspace:** Overview KPIs (`client_portal_overview`), Package Order & Custom Quote intake (`/portal/orders/new`), Proposal review/accept/decline (`/portal/proposals/[id]`), Order workspace with explicit **NDA** & **Rules of Engagement (RoE)** digital signing, deliverable review/acceptance/paid-revision requests, cancellation requests, and Live Contract Chat.
- **Billing, Vault & Security:** Printable A4 invoices with payment proof uploads, SHA-256 verified Encrypted Deliverables Vault (`/portal/files`) with 60-second signed attachment downloads, threaded Support Tickets, Retainers overview, Billing Address management, optional **Client TOTP MFA**, personal audit log, and hardened password management.

---

## Security & Database Engineering (`0001`–`0029`)

- **Strict Row Level Security (RLS):** Enabled on all **37 public PostgreSQL tables** with `initPlan`-cached `(select auth.uid())` checks and consolidated single-permissive policies (`0` Performance Advisor warnings on Supabase).
- **Mandatory Admin AAL2 MFA & Token Revocation:** `public.is_admin()` enforces active admin role + `app_metadata.role = 'admin'` + `aal2` MFA at both middleware/session and PostgreSQL levels, backed by `profiles.tokens_valid_after` epoch checks.
- **Free-Tier Leaked-Password Protection (`lib/auth/hibp.ts`):** Privacy-preserving HaveIBeenPwned `k-anonymity` Range API verification (only the first 5 SHA-1 prefix characters leave the server) plus offline common-breach blocking across signup, password change, recovery, and invite activation.
- **Atomic Financial & Storage Invariants:** Server-side catalog pricing in `create_package_order_atomic`, immutable issued invoices & credit notes, `vault_upload_reservations` concurrent 500 MiB quota locks, and automated daily maintenance via both Supabase `pg_cron` (`daily_crm_maintenance`) and Vercel Cron (`/api/cron/r2-retention`, `/api/cron/email-outbox`).

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
All 5 isolated test suites run against disposable loopback fixtures and in-memory PGlite (`0001`–`0029`) with zero production credentials:

```bash
npm run test:unit     # Vitest unit, security, auth, HIBP, CRM & SEO contract tests
npm run test:db       # PGlite full migration bootstrap, upgrade, RLS & financial invariant tests
npm run test:seo      # Playwright metadata, canonical, sitemap (31 URLs), robots, AEO/GEO tests
npm run test:a11y     # Playwright + axe-core WCAG 2.2 AA (light/dark) & responsive tests
npm run test:e2e      # Playwright full order->deliver->pay, auth/MFA, vault & admin E2E tests
node scripts/verify-quality-contract.mjs
```

---

## Documentation & Reference

- [`docs/MASTER_PLAN.md`](./docs/MASTER_PLAN.md) — Core v2 architecture & lifecycle specifications
- [`docs/QUALITY_GATES.md`](./docs/QUALITY_GATES.md) — Mandatory CI/SQA verification & release contract
- [`docs/LEGACY_ARCHITECTURE.md`](./docs/LEGACY_ARCHITECTURE.md) — Historical v1 reference ([`redwan-cse/redwan.work_old`](https://github.com/redwan-cse/redwan.work_old))
- [`AGENTS.md`](./AGENTS.md) — Engineering and release-authority guidelines for AI assistants

---

## Security & Licensing

- **Security Policy:** See [`SECURITY.md`](./SECURITY.md) for supported versions, scope, and private vulnerability reporting (`contact@redwan.work`).
- **License & Attribution:** Source-available under the [PolyForm Noncommercial License 1.0.0](./LICENSE). Noncommercial reuse of code snippets, educational study, and contribution are permitted.
  > **Note:** Personal biodata, curriculum vitae / resume (`public/resume.pdf`), academic credentials, research publications, certifications, photographs (`public/portrait.png`, `public/redwan.jpg`), case studies, and branding belonging to **Md. Redwan Ahmed** and **Fast Cyber Defense** are proprietary (`All Rights Reserved`) and must be removed or replaced before any deployment or publication.
