# redwan.work — Portfolio & Client CRM

Personal portfolio and full‑stack client CRM for **Md Redwan Ahmed** (cybersecurity professional).  
Live at [redwan.work](https://redwan.work).

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS 3 + shadcn/ui
- **Database & Auth:** Supabase (Postgres + auth)
- **Storage:** Cloudflare R2 (public/private buckets)
- **Email:** Resend (transactional)
- **Deployment:** Vercel (auto‑deploy from `main`)
- **Bot Protection:** Cloudflare Turnstile
- **Blog:** Google Blogger API

## Key Features

### Public Site
- **Blogs** – Google Blogger integration with pagination and preview modal.
- **Resume** – interactive web resume with print‑to‑PDF.
- **Contact** – rich lead capture with Turnstile, IP‑based rate limiting, and lead storage.
- **Dark/Light mode** – persistent theme switching.

### Client CRM (Admin & Portal)
- **Authentication** – email/password login, password reset, invitation flow.
- **Admin Panel** – manage clients, projects, tickets, invoices, and payments.
- **Client Portal** – view projects/files, create/reply to tickets, submit invoice payments.
- **Tickets** – threaded messages with status automation (open/answered/awaiting/closed).
- **Invoices & Payments** – draft/send/void/confirm/reject with atomic transitions.
- **Projects & Files** – deliverables with R2 presigned uploads, archive/purge cycle.
- **Lifecycle Emails** – 7 transactional events via Resend, audited in `email_log` with an admin viewer.
- **Security Hardening** – RLS, service‑role RPCs, signed upload sizes, deactivation revocation, generic errors.
- **Repository Security** – CodeQL + Semgrep on every push/PR, secret scanning with push protection, Dependabot, protected `main`, [`SECURITY.md`](./SECURITY.md) disclosure policy.

Full documentation in [`/docs`](./docs).

## Getting Started

### Prerequisites
- Node.js 20+ (npm)
- Supabase project (Postgres + auth)
- Cloudflare R2 bucket pair (public/private)
- Resend API key (for lifecycle emails)
- Google Blogger service account (for blog)

### Environment Variables

Create `.env.local` from `.env.example` and fill in. `.env.local` is
gitignored — never commit it. Variables prefixed `NEXT_PUBLIC_` are inlined
at **build** time, so Vercel must hold the production values.

```env
# Site (NEXT_PUBLIC_SITE_URL MUST be https://redwan.work in production —
# lifecycle-email links are built from it)
NEXT_PUBLIC_SITE_URL=

# Supabase (new-format keys only: sb_publishable_… / sb_secret_…)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# Cloudflare R2
R2_ENDPOINT=
R2_PUBLIC_BUCKET=
R2_PUBLIC_ACCESS_KEY_ID=
R2_PUBLIC_SECRET_ACCESS_KEY=
R2_PRIVATE_BUCKET=
R2_PRIVATE_ACCESS_KEY_ID=
R2_PRIVATE_SECRET_ACCESS_KEY=
NEXT_PUBLIC_R2_PUBLIC_BASE_URL=

# Resend (lifecycle emails)
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Turnstile (bot protection)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Blogger (graceful empty state without it)
BLOGGER_BLOG_ID=
GOOGLE_CREDENTIALS_B64= # base64 service account JSON

# Misc
LEAD_IP_HASH_SALT=      # openssl rand -hex 32; never store raw IPs
CRON_SECRET=            # bearer for /api/cron/r2-retention
REVALIDATION_SECRET=    # bearer for POST /api/revalidate
```

### Install & Run

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build (also type‑checks)
npm run lint      # ESLint
```

### Deployment

Every push to `main` auto‑deploys to Vercel.  
Never merge without explicit confirmation (see `AGENTS.md`).

## Project Structure

```
├── app/                # App Router pages (public, admin, portal, api)
├── components/         # React components (ui/ is shadcn)
├── lib/                # Utilities (Supabase, R2, CRM modules)
├── hooks/              # Custom React hooks
├── docs/               # Feature documentation
├── supabase/           # Migrations
├── public/             # Static assets
└── .env.local          # Secrets (never committed)
```

## Documentation

Detailed docs for each feature live in `/docs`:

- [`docs/auth`](./docs/auth) – authentication, sessions, proxy
- [`docs/crm`](./docs/crm) – admin/client actions, tickets, invoices, projects
- [`docs/r2`](./docs/r2) – object storage, presigned URLs, retention
- [`docs/security`](./docs/security) – hardening, probe matrix, repo security controls, residual risks
  - [`docs/security/AUDIT-PLAN.md`](./docs/security/AUDIT-PLAN.md) – full-project audit runbook for a fresh session or agent
- [`docs/email`](./docs/email) – lifecycle emails, delivery classification, email log
- [`docs/contact`](./docs/contact) – form, Turnstile, leads
- [`docs/blogs`](./docs/blogs) – Blogger integration
- [`docs/resume`](./docs/resume) – resume and PDF export

## License

All Rights Reserved © 2026 Md Redwan Ahmed