# AGENTS.md — redwan.work

Personal portfolio of Md Redwan Ahmed (cybersecurity professional). Live at https://redwan.work.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS 3 + shadcn/ui (`components/ui/*`) + Radix primitives
- ESLint 9 (`eslint-config-next`)
- Deployed on **Vercel — every push to `main` auto-deploys to production. Never push/merge to main without explicit user confirmation.**

## Commands

```bash
npm run dev      # dev server on http://localhost:3000
npm run build    # production build (also type-checks)
npm run lint     # eslint
npx tsc --noEmit # type check only
```

Use **npm** (package-lock.json is committed; do not switch package managers).

## Architecture

- `app/` — App Router pages: `/`, `/blogs`, `/portfolio`, `/services`, `/resume`, `/contact`, `/privacy`, plus `app/api/` (contact, resume-pdf, revalidate)
- `components/` — feature components; `components/ui/` is shadcn/ui (do not hand-edit generated files)
- `lib/blogger.ts` — Blogger API integration (blog listing uses ISR, 60s revalidation)
- `hooks/`, `lib/utils.ts` (`cn()` helper) 
- `docs/` — per-feature documentation (blogs, contact, resume, home, portfolio, services, ai_review). Read the relevant `docs/<feature>/` folder before changing that feature.

## Conventions

- Server Components by default; add `"use client"` only for interactivity
- Use `cn()` from `@/lib/utils` for conditional classes
- Follow existing shadcn/ui patterns for new UI
- TypeScript strict mode must stay clean

## Environment

`.env.local` holds secrets (Blogger service account, Turnstile keys, Google Form URL). Placeholders are fine for UI work — blog/contact features degrade gracefully without them. Never log or commit secret values.

## External integrations

- Blog content lives in Google Blogger (not in this repo)
- Contact form posts to a Google Forms backend with Cloudflare Turnstile verification
- See `docs/contact/turnstile-integration.md` before touching form/bot-protection code
