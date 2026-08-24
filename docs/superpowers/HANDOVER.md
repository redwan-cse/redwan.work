# Handover Prompt — redwan.work CRM Build (paste into new session)

You are continuing a multi-phase upgrade of my portfolio **redwan.work** (repo: `/home/redwan/workspace/redwan.work`, branch `main`). Read `AGENTS.md` first. Follow the superpowers skills flow exactly like the previous session did.

## Context

Personal portfolio of Md Redwan Ahmed (cybersecurity freelancer) being upgraded from static site to full-stack client CRM: Supabase (auth + Postgres), Cloudflare R2 (dual-bucket assets), Resend (email). Two panels: Admin (`/admin`) and Client (`/portal`).

**Phase 1 (Supabase-only leads pipeline) is SHIPPED TO PRODUCTION** @ `e75ca0e`, verified live on https://redwan.work. Google Forms sink fully retired.

## Authoritative documents (read before anything)

1. `docs/superpowers/specs/2026-08-24-client-crm-design.md` — approved master design (architecture A: single app, route groups, RLS boundary, presigned R2)
2. `docs/superpowers/reports/2026-08-24-phase1-completion-report.md` — what's done/validated/remaining
3. `docs/superpowers/plans/2026-08-24-phase1-supabase-leads.md` — example of plan format expected
4. `docs/plan/next-stage-plan.md` — original approved roadmap (Phases 0–2 done/underway)

## Locked decisions (do not relitigate)

- Single Next.js app; route groups `(admin)` / `(client)` behind `middleware.ts`; RLS is the real security boundary
- Auth: email+password primary, magic-link fallback; **admin-invite only**, no public signup
- Roles dual-stored: `app_metadata.role` (JWT claim, middleware gating) + `profiles.role` (RLS helper)
- Env naming convention (user's): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `LEAD_IP_HASH_SALT`, `R2_ENDPOINT`, per-bucket `R2_PUBLIC_*`/`R2_PRIVATE_*` keys, `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`
- New-format Supabase keys only (`sb_publishable_…`/`sb_secret_…`); never legacy anon JWTs
- `.env.example` mirrors the live key-set 1:1; no new vars planned, only removals later
- Migration `0001_leads_and_rate_limits.sql` already pushed; tables live; RPC locked to service_role
- Contact form sends BOTH Google `entry.*` ids AND raw-named field mirrors; the Supabase parser reads raw names only
- Blogger integration stays as-is (`lib/blogger.ts`, module-level TTL cache — NOT `unstable_cache`)
- Every push to `main` auto-deploys to Vercel — never push/merge without my explicit confirmation

## Next task

Start **P3a — Auth foundation** (recommended order: P3a → P3b → P2 → P3c → P4a → P4b → P5):
`middleware.ts` (@supabase/ssr pattern, `getClaims()` early), `profiles` table + roles + admin bootstrap, login/reset-password/invite-accept pages, empty panel shells.
Begin with the brainstorming skill → confirm scope → writing-plans → subagent-driven-development with per-task reviews (this loop worked well in Phase 1).

## Session gotchas (learned the hard way)

- SQL LSP reports false syntax errors on `supabase/migrations/*.sql` — ignore; trust `supabase db push`
- `pkill -f 'next dev'` matches the tool shell's own command string and kills the session — use `pkill -f '[n]ext dev'`
- Never print env values — names/presence only
- Vercel CLI is logged out here; verify deployments by curl-ing live pages for content markers
- `.opencode/opencode.json` holds the Supabase MCP config (gitignored); needs an opencode restart to activate
- No test framework by decision; gate = `npm run lint` → `npx tsc --noEmit` → `npm run build` → curl probes

## Open backlog

- [ ] Dependabot: 68 vulns (37 high) — dedicated dependency-bump PR wanted
- [ ] Confirm first production form submit lands a row (Supabase Table Editor)
- [ ] Probe Turnstile replay-guard 400 + browser TKT success card when convenient
