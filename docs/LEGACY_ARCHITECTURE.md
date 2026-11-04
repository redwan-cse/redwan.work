# Legacy Architecture & Subsystem Reference

This document provides a comprehensive overview of the archived `redwan.work` project (`J:\DevDrive\redwan.work_old`) to serve as an authoritative reference during the rewrite.

---

## 1. System Overview

`redwan.work` serves two distinct purposes:
1. **Public Portfolio & Identity:** Showcasing cyber security expertise, resume, blogs, and services for Md Redwan Ahmed.
2. **Client CRM & Portal:** Full-lifecycle client onboarding, ticketing, project milestone deliverables, and invoice payments.

---

## 2. Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui + Lucide Icons + next-themes
- **Database & Auth:** Supabase (PostgreSQL with RLS + `@supabase/ssr`)
- **Object Storage:** Cloudflare R2 (S3-compatible API via `@aws-sdk/client-s3`)
- **Email Delivery:** Resend (transactional lifecycle notifications)
- **Bot Defense:** Cloudflare Turnstile (Contact form & rate limiting)
- **CMS / Blog:** Google Blogger API v3 (`googleapis`)
- **Deployment:** Vercel

---

## 3. Directory Layout in Legacy Repo (`J:\DevDrive\redwan.work_old`)

```text
redwan.work_old/
├── app/
│   ├── (admin)/                # Protected admin CRM dashboard
│   │   └── admin/              # Clients, projects, invoices, tickets, email logs
│   ├── (auth)/                 # Login, reset password, accept invite
│   ├── (client)/               # Protected client portal
│   │   └── portal/             # Client projects, files, tickets, invoices
│   ├── api/                    # Route handlers (cron, webhooks, auth, presigned URLs)
│   ├── blogs/                  # Google Blogger integration & post preview
│   ├── contact/                # Contact form with Turnstile & rate limiting
│   ├── portfolio/              # Security projects & case studies
│   ├── privacy/                # Privacy policy
│   ├── resume/                 # Interactive resume with print-to-PDF
│   ├── services/               # Offered cybersecurity services
│   ├── layout.tsx              # Root layout & theme provider
│   └── page.tsx                # Home / Landing page
├── components/                 # UI components (shadcn/ui + custom CRM widgets)
├── docs/                       # Architectural specs & security audit records
├── hooks/                      # Custom React hooks
├── lib/                        # Business logic, Supabase clients, R2 wrappers, email dispatchers
├── supabase/
│   └── migrations/             # 41 SQL migrations (0001 to 0041)
└── tests/                      # Integration and unit tests
```

---

## 4. Database Schema Summary (Supabase)

The database was managed through 41 sequential migrations (`supabase/migrations/0001_...` to `0041_...`):

### Core Tables
- **`profiles`:** User profile linked to `auth.users(id)` with `role` (`admin` | `client`), company, full name, status (`active` | `deactivated`).
- **`leads`:** Public contact submissions with IP hashing (`lead_ip_hash_salt`), consent flags, status (`new` | `contacted` | `converted` | `archived`).
- **`projects`:** Client projects with milestones, status (`planning` | `in_progress` | `in_review` | `completed` | `archived`), budget, dates.
- **`deliverables` / `project_files`:** Files attached to projects stored in R2, status tracking, download authorization via signed URLs.
- **`tickets` & `ticket_messages`:** Threaded communication between admin and clients. Ticket states: `open`, `answered`, `awaiting_client`, `closed`.
- **`invoices` & `invoice_items`:** Invoices with atomic state transitions: `draft` -> `sent` -> `paid` (or `void`). Itemized totals, due dates, snapshots.
- **`payments`:** Payment records linked to invoices with payment methods (bank transfer, card, manual) and confirmation workflow.
- **`email_log`:** Audited log of all outbound transactional emails sent via Resend, status (`sent`, `failed`, `pending_retry`).
- **`rate_limits` / `rate_limit_buckets`:** Token bucket or window-based rate limiting stored in DB for contact, OTP, and presign endpoints.

---

## 5. Environment Variables Spec (`.env.example`)

```env
# Site Configuration
NEXT_PUBLIC_SITE_URL=https://redwan.work

# Supabase (Postgres & Auth)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

# Cloudflare R2 (Object Storage)
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_PUBLIC_BUCKET=redwan-work-public
R2_PUBLIC_ACCESS_KEY_ID=
R2_PUBLIC_SECRET_ACCESS_KEY=
NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://pub-...r2.dev

R2_PRIVATE_BUCKET=redwan-work-private
R2_PRIVATE_ACCESS_KEY_ID=
R2_PRIVATE_SECRET_ACCESS_KEY=

# Resend (Transactional Email)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Md Redwan Ahmed <hello@redwan.work>

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
TURNSTILE_SECRET_KEY=0x...

# Google Blogger API
BLOGGER_BLOG_ID=
GOOGLE_CREDENTIALS_B64= # Base64-encoded Service Account JSON

# Security & Background Tasks
LEAD_IP_HASH_SALT=     # 32-byte hex for IP pseudonymization
CRON_SECRET=           # Bearer token for cron routes
REVALIDATION_SECRET=   # Bearer token for on-demand ISR revalidation
```

---

## 6. Key Subsystems & Design Choices

### Storage (Cloudflare R2)
- Separate **Public** (assets, blog images, avatar) and **Private** (client deliverables, invoices, confidential reports) buckets.
- File uploads use pre-signed URLs generated server-side with strict size and MIME type validation.
- Downloads for private assets generate short-lived pre-signed download URLs after validating user authorization.

### Client CRM Workflows
- **Milestone & Deliverable Locking:** When milestones complete, deliverable confirmations lock state to prevent tampering.
- **Atomic State Transitions:** Invoices, payments, and ticket state transitions use Supabase RPCs with database transactions to ensure consistency.
- **Audited Email Outbox:** Outbound emails are tracked in `email_log` with retry handling and administrative visibility.

---

## 7. Migration & Rebuild Strategy

1. Maintain full backward-compatibility with existing external services (Supabase DB instance, Cloudflare R2 buckets, and Resend credentials) if reusing them.
2. Review `J:\DevDrive\redwan.work_old\supabase\migrations` before modifying or applying database schema changes.
3. Reuse UI styles, branding tokens, and copywriting from `redwan.work_old` as needed.
