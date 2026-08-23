# redwan.work — Next Stage Implementation Plan

> Created: 2026-08-23 · Status: approved
> Stack additions planned: Supabase (DB), Resend (email, deferred), Cloudflare R2 (attachments)

## Decisions locked

| Decision | Choice |
|---|---|
| Leads storage | Supabase **replaces** Google Forms (dual-write transition) |
| R2 usage | Contact-form attachments |
| Admin panel | Deferred (read leads in Supabase dashboard for now) |
| Resend | Deferred — marketing + verification emails, later, inside future customer dashboard |

---

## Phase 0 — Stabilize & harden (no new infra)

Branch: `chore/harden` · small commits: fixes → hardening → SEO → UX shell

### Fixes
1. `app/blogs/page.tsx`: remove `dynamic = 'force-dynamic'`, restore true ISR (`revalidate = 60`);
   paginate via Blogger API `startIndex` instead of fetch-100-slice-9.
2. Delete dead template route `app/api/resume-pdf/route.ts`.
3. `components/enhanced-contact-form.tsx`: strip PII `console.log`;
   `app/api/contact/route.ts`: verify Google Forms response status before returning success.
4. `/api/revalidate`: secret via `Authorization` header (not query string),
   timing-safe compare (`crypto.timingSafeEqual`), path allowlist (`/blogs` only).

### Hardening
5. Security headers via `next.config.js` `headers()`: HSTS,
   `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy,
   nonce-based CSP (`script-src`/`frame-src challenges.cloudflare.com`).
6. Same-origin check + interim per-IP rate limit on `/api/contact`
   (in-memory = per-lambda-instance approximation; real enforcement lands
   in Phase 1 via Supabase table).

### SEO pack
7. `metadataBase` in `app/layout.tsx`; metadata exports for home /
   `/portfolio` / `/services` / `/resume`; OpenGraph + Twitter cards;
   JSON-LD `Person` schema.
8. New: `app/sitemap.ts`, `app/robots.ts`, `app/error.tsx`,
   `app/global-error.tsx`, `app/not-found.tsx`.

### Content & cleanup
9. Extract duplicated data → `lib/content/*.ts` single source
   (projects: portfolio page + project-carousel; services: services page +
   services-grid; testimonials; resume data out of client bundle).
10. Remove unused `recharts` dep + `components/ui/chart.tsx`.
11. A11y: `aria-label`s on icon-only carousel buttons; keyboard-accessible
    blog modal trigger; label star ratings.

---

## Phase 1 — Supabase leads (replaces Google Forms)

Branch: `feat/supabase-leads`

12. Schema `leads`: server-generated ticket ID, name, email, country,
    whatsapp (E.164), timezone, services[], budget, urgency, summary,
    source page, user-agent, ip-hash, **consent timestamp**,
    `status` enum (`new/contacted/won/lost`),
    reserved columns for Phase 3: `email_verified_at`, `marketing_opt_in`.
13. Rewrite `/api/contact`: Turnstile → validate → insert via service-role
    key (server-only) → return server ticket ID.
    Feature flag `LEADS_SINK=supabase|forms` for dual-write cutover.
14. Rate limiting backed by Supabase table (per ip-hash +
    Turnstile token reuse guard).
15. Update `docs/contact/` + privacy page:
    new data flows, retention policy, consent is now a stored record.

---

## Phase 2 — R2 contact-form attachments

Branch: `feat/r2-attachments`

16. `POST /api/uploads/presign`: presigned PUT URLs; credentials
    server-only. Limits: ≤10 MB/file, allowlist `.pdf .docx .png .jpg .zip`,
    max N files/lead, requires valid Turnstile session.
17. Lead submission stores attachment object keys; public read via
    R2 custom domain; add domain to `next.config.js` remotePatterns.
18. Retention: auto-delete attachments after N days
    (privacy + free-tier hygiene) — cron/queued job.

---

## Phase 3 — Deferred (designed-for now, built later)

19. **Resend**: DKIM/SPF on `redwan.work`; React Email templates;
    lead notifications, verification, marketing (schema reserved).
20. **Customer dashboard** (Supabase Auth) + minimal leads admin view.
21. Blog detail pages on own domain (sanitized HTML render) — SEO win.
22. CI: GitHub Actions (lint + typecheck + build); Vitest smoke tests;
    Vercel Analytics.

---

## Deploy safety

- One branch → one PR per phase; user reviews and merges to `main`
  explicitly (Vercel auto-deploys on merge).
- Verification loop per phase: `npm run lint` → `npx tsc --noEmit`
  → `npm run build` → Playwright inspection at localhost:3000.

---

## Audit findings reference (2026-08-23)

### Security issues addressed in Phase 0
- S1 (High): No rate limiting anywhere; Turnstile sole barrier
- S2 (Med): No security headers (CSP, HSTS, X-Frame-Options)
- S3 (Med): `/api/revalidate` secret in query string, non-timing-safe compare, unrestricted path
- S4 (Med): Contact API ignores Google Forms response status → silent data loss
- S5 (Med): Client console.log dumps all lead PII in production
- S6 (Low): Ticket ID client-generated/spoofable (fixed properly in Phase 1)
- S7 (Low): No same-origin check on `/api/contact`

### Performance issues addressed in Phase 0
- P1: ISR broken by `force-dynamic`; every visitor fetched 100 posts from Blogger API
- P2: `recharts` + `components/ui/chart.tsx` completely unused dead weight
- P4: Project/service data duplicated between home carousels and detail pages
- P5: Footer hotlinks external favicon via raw `<img>`

### SEO gaps addressed in Phase 0
- No sitemap/robots/metadataBase/OpenGraph/canonicals/JSON-LD
- Missing per-page metadata on home, /portfolio, /services, /resume
- Missing error/not-found boundaries
