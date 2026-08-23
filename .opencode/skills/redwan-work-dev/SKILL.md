---
name: redwan-work-dev
description: Project guide for the redwan.work portfolio repo (Next.js 16, shadcn/ui, Blogger API, Vercel). Use when working on pages, components, blogs integration, contact form, resume/PDF, or deployment-related tasks in this repository.
---

# redwan.work development guide

## Before changing any feature

Read `docs/<feature>/` first — each feature folder documents design decisions:

| Feature | Docs | Key files |
|---|---|---|
| Blogs | `docs/blogs/` | `app/blogs/`, `lib/blogger.ts` |
| Contact form | `docs/contact/` | `app/contact/`, `components/enhanced-contact-form.tsx`, `app/api/contact/` |
| Resume + PDF export | `docs/resume/` | `app/resume/`, `components/printable-resume.tsx`, `app/api/resume-pdf/` |
| Home | `docs/home/` | `app/page.tsx` |
| Portfolio / Services | `docs/portfolio/`, `docs/services/` | matching `app/` folders |

## Non-obvious behaviors

- **ISR:** `/blogs` revalidates every 60s via Blogger API; content is not in this repo. `app/api/revalidate` exists for on-demand cache busting (protected by `REVALIDATION_SECRET`).
- **Contact flow:** form → Turnstile verify (`TURNSTILE_SECRET_KEY`) → POST to Google Forms `formResponse` URL. Ticket IDs and country/timezone detection are generated client-side.
- **Print-to-PDF resume:** web resume and PDF must stay visually synchronized; test both after edits (`react-to-print`).
- **Images:** remote images allowed only from unsplash, googleusercontent, blogger.com, blogspot.com (see `next.config.js`). Add patterns there for new CDNs.

## Verification loop

1. `npm run lint`
2. `npm run build` (catches type errors)
3. For UI changes: start dev server and inspect pages with the Playwright MCP at http://localhost:3000

## Deploy safety

Vercel deploys production on push to `main`. Always work on a branch and let the user decide when to merge/deploy.
