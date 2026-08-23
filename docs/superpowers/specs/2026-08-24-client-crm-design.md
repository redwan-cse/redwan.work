# Client CRM & Portal System — Design Spec

> Created: 2026-08-24 · Status: approved
> Builds on top of `docs/plan/next-stage-plan.md` (Phases 1–2 unchanged; this spec supersedes its deferred Phase 3).
> Goal: evolve redwan.work from a static portfolio into a full-stack freelance CRM with an Admin panel and a Client portal.

## 1. Locked decisions

| Decision | Choice |
|---|---|
| Architecture | Single Next.js 16 app; route groups `(admin)` and `(client)` behind `middleware.ts` |
| Security model | Postgres RLS is the real boundary; service-role key used server-side only |
| Role storage | Dual: `auth.users.app_metadata.role` (JWT claim, admin-only writable) + `profiles.role` (RLS queries) |
| Auth method | Email+password primary; magic-link (`signInWithOtp`) fallback |
| Onboarding | Admin-invite only via `inviteUserByEmail`; no public signup ever |
| Client panel scope | Tickets + threaded replies; deliverables Files tab; projects + milestones; invoices with manual-payment tracking |
| Admin panel scope | Overview, client CRUD + invites + lead conversion, ticket inbox, projects, invoices/payment confirmation, public asset uploader |
| R2 layout | Public bucket → Cloudflare CDN direct reads (new assets only at launch); private bucket → ownership-checked presigned GET/PUT only |
| Private file RBAC | Server mints object keys from session identity (`private/{user_id}/…`); client input never determines path |
| Email | Resend as Supabase custom SMTP (invite/reset) + Resend API for lifecycle events; all sends logged to `email_log` |
| Supabase keys | Latest publishable/secret key formats (`sb_publishable_…`, `sb_secret_…`). Legacy anon JWT keys are forbidden |

## 2. Runtime architecture

```
Browser ──► Next.js 16 (single deploy on Vercel)
             ├─ middleware.ts        @supabase/ssr session refresh + role guards
             ├─ app/(site)/…         existing public site (unchanged)
             ├─ app/(auth)/login|reset|invite-accept
             ├─ app/(admin)/admin/…  requires claim role='admin'
             ├─ app/(client)/portal/… requires role='client'
             └─ server actions       all mutations (service-role only here)
                        │
     ┌──────────────────┼─────────────────────┐
     ▼                  ▼                     ▼
 Supabase          Cloudflare R2            Resend
 Postgres+Auth     public bucket → CDN      SMTP for Supabase auth mail
 (RLS enforced)    private bucket →         API for lifecycle events
                   presigned GET (60s) /
                   PUT (10 min)
```

### Middleware contract
- Uses `@supabase/ssr` `createServerClient` with `parseCookieHeader`/cookie setters; calls `await supabase.auth.getClaims()` early so refresh cookies survive.
- Matcher: `/admin/:path*`, `/portal/:path*`, `/login`, `/reset-password`, `/invite/:path*`.
- Unauthenticated → redirect `/login?next=<path>`; wrong role → redirect to their panel home; deactivated client (`profiles.is_active = false`) → forced logout.

### Defense-in-depth
Even though reads/writes flow through server code, every table carries RLS policies:
- `is_admin()` SQL helper: checks JWT claim `auth.jwt()->'app_metadata'->>'role' = 'admin'`.
- Client policies: row's `client_id` must equal the caller's profile id.
- A leaked publishable key or UI bug can therefore never expose another client's data.

## 3. Data model

All UUID primary keys; timestamps `timestamptz default now()`. Migrations live in versioned `supabase/migrations/`, applied with `supabase db push`.

```
profiles(id ← auth.users, role 'admin'|'client', full_name, company,
         is_active bool default true, created_at)

projects(id, client_id → profiles, name, description,
         status 'active'|'paused'|'done', started_at, due_at)

milestones(id, project_id → projects, title, amount_cents int,
           currency char(3), position int,
           status 'pending'|'in_progress'|'done')

tickets(id, number int generated (displayed as #TKT-<number>),
        project_id? → projects, client_id → profiles, subject,
        status 'open'|'answered'|'awaiting_client'|'closed',
        last_message_at, created_at)
        -- created_by_role implied by author of first message

ticket_messages(id, ticket_id → tickets, author_id → profiles,
                body text, created_at)

files(id, bucket 'public'|'private', r2_key unique,
      kind 'attachment'|'deliverable'|'asset',
      ticket_id? , project_id?, invoice_id?,
      uploaded_by → profiles, filename, mime, size_bytes, created_at)

invoices(id, project_id → projects, number, currency,
         status 'draft'|'sent'|'paid'|'void',
         issued_at, due_at, payment_note)

invoice_items(id, invoice_id → invoices, description,
              qty numeric, unit_price_cents int, position int)

payments(id, invoice_id → invoices,
         method 'bank'|'bkash'|'paypal'|'other',
         reference text,          -- txn id submitted by client
         amount_cents int, status 'submitted'|'confirmed'|'rejected',
         confirmed_by? → profiles, confirmed_at?, created_at)

leads / rate_limits       -- per approved next-stage plan Phase 1
email_log(id, to_email, template, entity_type?, entity_id?,
          resend_id, status, error?, created_at)
```

### Behavior triggers
- INSERT on `ticket_messages`: author is client → ticket becomes `open`; author is admin → `answered`. Updates `last_message_at`.
- UPDATE on `payments.status='confirmed'` (admin-only policy) → parent invoice status becomes `paid`.

### RLS summary
| Table | Client role | Admin role |
|---|---|---|
| profiles | SELECT own | all |
| projects/milestones | SELECT where client_id = own | all |
| tickets/messages | SELECT/INSERT where ticket.client_id = own | all |
| files | SELECT where scoped row belongs to own client_id | all |
| invoices/items | SELECT where project.client_id = own | all |
| payments | INSERT (submitted) where own invoice; SELECT own | all incl. status transitions |
| leads, rate_limits, email_log | none | all |

## 4. R2 storage design

One helper module `lib/r2.ts` (S3Client, region `auto`, endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`) shared by contact-form attachments (approved Phase 2) and the portal.

| Aspect | Public bucket | Private bucket |
|---|---|---|
| Content | New portfolio/blog assets | Ticket attachments, deliverables |
| Read | Custom domain CDN URL, cache-forever keys `assets/{yyyy}/{ulid}.{ext}` | Presigned GET, 60 s expiry, after ownership check |
| Write | Admin-only server action → direct S3 put | Presigned PUT, 10 min expiry; key minted server-side `private/{user_id}/{scope}_{id}/{ulid}.{ext}` |
| Limits | mime allowlist png/jpg/webp/svg/avif/pdf, ≤5 MB | ext allowlist .pdf .docx .doc .xlsx .png .jpg .zip, ≤10 MB/file, ≤10 files per ticket, deliverable count uncapped at launch |
| Delete | Admin server action | Admin any; client own-scope within grace window |

Retention: Vercel Cron job deletes orphaned private attachment objects past N days (privacy + free-tier hygiene), matching the retention policy published on the privacy page.

## 5. Panels

### Admin `/admin` (sidebar shell, server-rendered tables)
- Overview: open tickets, unpaid invoices, recent leads
- Clients: list, invite (email → set-password link), deactivate/reactivate, convert lead→client
- Tickets: inbox with status filters; thread view to reply, change status, attach files
- Projects: CRUD; milestones list; per-project files & invoices
- Invoices: build from milestones or free line items; mark sent; confirm/reject submitted payments
- Assets: public-bucket uploader for portfolio/blog images

### Client `/portal`
- Dashboard: active projects, ticket statuses, outstanding invoice
- Tickets: create (+attachments), threaded view, reply
- Files: deliverables browser per project, presigned downloads
- Invoices: invoice detail page (print-friendly), submit payment reference (method + txn ID), see confirmation state

## 6. Email (Resend)

- Supabase Auth SMTP configured to Resend so invite/set-password/reset mails carry `redwan.work` DKIM reputation.
- App lifecycle emails via Resend API + React Email templates in `emails/`, sender `no-reply@redwan.work`, every send recorded in `email_log`:
  invite, new-ticket (→admin), reply-posted (→other party), status-changed, deliverable-uploaded, invoice-issued, payment-confirmed.

## 7. Environment variables

Added to `.env.example`; real values in `.env.local` (never committed):
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (sb_publishable_…, never legacy anon), `SUPABASE_SERVICE_ROLE_KEY` (sb_secret_…), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_DOMAIN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`. All server-only except `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`.

## 8. Phase roadmap

Each phase = one branch → one PR → explicit user merge (Vercel auto-deploys).

1. **P1 — Supabase leads** (per approved next-stage plan): schema + migrations, `/api/contact` rewrite behind `LEADS_SINK=supabase|forms` dual-write, DB-backed rate limiting.
2. **P2 — R2 foundation**: provision both buckets + custom domain; `lib/r2.ts`; contact-form attachments; retention cron.
3. **P3a — Auth foundation**: middleware, profiles + roles, admin bootstrap, login/reset/invite-accept pages, empty panel shells.
4. **P3b — CRM core**: tickets/messages schema + RLS, admin tickets + clients views, lead conversion, Resend SMTP wiring.
5. **P3c — Client portal v1**: ticket create/list/thread/reply UI.
6. **P4a — Projects & files**: milestones; deliverables upload (admin); files browser (client).
7. **P4b — Invoices & payments**: invoice builder; payment-reference submission; admin confirmation.
8. **P5 — Polish**: remaining lifecycle emails, public asset uploader, email_log viewer.

## 9. Verification loop (every phase)

`npm run lint` → `npx tsc --noEmit` → `npm run build` → Playwright walkthrough at localhost:3000 → RLS cross-client probe in Supabase SQL editor → feature docs updated under `docs/<feature>/README.md`.
