# Handover Prompt — redwan.work CRM Build (paste into new session)

You are continuing a multi-phase upgrade of my portfolio **redwan.work** (repo: `/home/redwan/workspace/redwan.work`). Read `AGENTS.md` first. Follow the superpowers skills flow exactly like the previous session did.

## Why this session became large (read first)

This single session ran **P3a → P3b → P2 → P3c → P4a** end-to-end without compaction, each via `brainstorming → writing-plans (self-review) → subagent-driven-development` (fresh implementer + task reviewer + scoped re-review per task + final whole-branch review). By design, **everything pasted into a dispatch prompt and everything a subagent prints back stays resident for the rest of the session and is re-read on every turn**. Plan docs (400-1600 lines each), review packages (50-270 KB diffs), and 5-7 task reports per phase accumulated. P4a alone was 10 commits + 3 fix rounds. The controller also re-diffed cross-task coherence. Result: context grew linearly with phases. **Next session must start fresh** — do not resume this session's context.

## Context

Personal portfolio of Md Redwan Ahmed (cybersecurity freelancer) being upgraded from static site to full-stack client CRM: Supabase (auth+Postgres, project `cqxtmzzlywolulechcob`), Cloudflare R2 (public+private buckets), Resend (email). Two panels: Admin (`/admin`) and Client (`/portal`). Deployed on Vercel — every push to `main` auto-deploys.

**Shipped to production (main = `ab2f0d2`):**
- P1 Supabase-only leads pipeline @ `e75ca0e`
- P3a Auth foundation @ `b33c6df` (proxy.ts, profiles, login/reset/invite, panel shells)
- P3b CRM core @ `c782ed2`
- P3c Client portal v1 @ `9f964c9` (includes hardening `0004`)
- P2 R2 foundation (contact attachments, 90-day retention) @ `ef7d637`
- P4a Projects & files (archive→30d→purge) @ `ab2f0d2` — includes 0006 projects/milestones/files + hardening `0004` + fix `9dfb4cf` (download 404 hardening). **Live verified:** `/admin/projects` 307, `/portal/files` 307, `/api/cron/r2-retention` 401, `/` 200.

**Current branch (UNPUSHED, unmerged):** `feat/p5a-security-hardening` forked from `2f724d0` (P5a plan doc). Contains:
- `docs(plan): add phase 5a security hardening plan` (`2f724d0`)
- **Uncommitted Task 1 work in progress:** `supabase/migrations/0014_security_hardening.sql` (217 lines, created) + `lib/crm/invoices.ts` modified (voidInvoice now calls `void_invoice_atomic`). **Not yet verified/committed.** Git status shows these 2 files modified + `.superpowers/sdd/...` untracked reports (gitignored).

## Authoritative documents (read before anything)

1. `docs/superpowers/specs/2026-08-24-client-crm-design.md` — approved master design (§8 roadmap: P5 = Polish = lifecycle emails + public asset uploader + email_log viewer)
2. `docs/superpowers/reports/2026-08-24-phase1-completion-report.md`
3. `docs/superpowers/plans/2026-08-31-p5a-security-hardening.md` — **current phase plan** (5 tasks, exact interfaces, self-reviewed fixes applied)
4. `docs/superpowers/plans/2026-08-25-p4a-projects-files.md` (450 lines) — precedent for P4a file map
5. `docs/plan/next-stage-plan.md`

Ledger for current phase: `.superpowers/sdd/2026-08-31-p5a-security-hardening/progress.md` (contains pre-flight scan table + two Rulings; update it per SDD skill after each task).
Per-task briefs: `.superpowers/sdd/2026-08-31-p5a-security-hardening/task-{1..5}-brief.md` (generated via `scripts/task-brief`).

## Locked decisions (do not relitigate)

- Single Next.js 16 app; route groups `(admin)/(client)` behind `proxy.ts` (Next 16's `proxy`, not middleware) — spec delta approved.
- RLS is the real boundary; service-role is the only mutation surface for tickets/invoices/items/payments/files (P5a enforces removal of client direct writes).
- Roles dual-stored: `auth.users.app_metadata.role` (JWT claim) + `profiles.role`/`is_active`; `is_admin()` helper checks JWT claim.
- Env naming: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `LEAD_IP_HASH_SALT`, `R2_ENDPOINT`+`R2_PUBLIC_*`/`R2_PRIVATE_*`, `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`, `CRON_SECRET` (added P2), `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (deferred to P5b). New-format keys only (`sb_publishable_`/`sb_secret_`).
- Contact form sends both Google `entry.*` and raw-named mirrors; Supabase parser reads raw names.
- Every push to `main` auto-deploys — never push/merge without my explicit confirmation.
- No persistent probe fixtures (post-P3b F1 lesson: `probe.client` was deleted in `2371092`).
- Migrations are forward-only; never edit 0007-0013; new work in 0014/0015.

## Next task — RESUME P5a Task 1

**Plan:** `docs/superpowers/plans/2026-08-31-p5a-security-hardening.md` — 5 tasks:

1. **T1 Migration 0014** — drop client ticket INSERT policies, narrow 3 invoice `FOR ALL` → `FOR SELECT`, guard `status` in `guard_invoice_lock`, add payment DELETE guard + invoice-delete cascade marker, resolve pending-attachment CHECK (`r2_key LIKE '%/pending/%'`), fix `voidInvoice` to call `void_invoice_atomic`. **Currently interrupted** — file exists (217 lines), needs fix for `void_invoice_atomic`.
2. T2 Signed upload size + confirm-time HEAD verification
3. T3 `is_active` in `getOwnedFileUrl` + session revocation + `requireAdmin` re-check
4. T4 Generic errors + fail-closed limits + portal key scoping (creates 0015)
5. T5 Security docs + close-out + final whole-branch review

**How to resume (do this first in new session):**

```bash
git status --short --branch # should show feat/p5a-security-hardening with 0014 + invoices.ts modified
# Inspect what the interrupted subagent left:
git diff supabase/migrations/0014_security_hardening.sql | head -80
grep -n "void_invoice_atomic\|guard_invoice_lock\|payment_delete" supabase/migrations/0014_security_hardening.sql
# Verify void fix: the interrupted agent correctly routed voidInvoice through void_invoice_atomic (good — keep it).
# Now follow Task 1 brief Step 2-3:
npx supabase db push   # will attempt 0014; if already partially applied, fix forward
npx supabase migration list  # expect 0014 local+remote after
# Bypass probes (6 probes: 4 denials + 2 service-role happy paths + pending-attachment check)
# If probes pass, commit per brief Step 4:
git add supabase/migrations/0014_security_hardening.sql lib/crm/invoices.ts
git commit -m "fix(security): remove direct write bypasses for tickets invoices and payments"
# Then continue SDD:
# scripts/task-brief already generated for T1; controller validates T1 via review-package + task reviewer, then T2...
```

**Pre-flight scan rulings already ledgered:**
- 0015 (rate kind) split into T4 for legibility.
- Probe limits: use REST/CLI for RLS; record unavailable probes rather than claiming passes.

## Session gotchas (learned across phases)

- SQL LSP false positives on migrations — ignore; trust `db push`.
- `pkill -f 'next dev'` kills the tool shell — use `pkill -f '[n]ext dev'`.
- Never print env values — names/presence only.
- Vercel CLI logged out; verify deployments via `curl -s -D - https://redwan.work/<path>` for `307 → /login?next=…` + `home 200` + CSP `connect-src` contains `r2.cloudflarestorage.com`.
- `.opencode/opencode.json` has Supabase MCP (gitignored) — needs restart; MCP's `execute_sql` often shows `Invalid project ref` — use `npx supabase db query --linked` / REST instead.
- Subagent provider flaked repeatedly (rate limited / "x-preview-f-free not supported") — authorized fallback: controller does Task 6 + validation inline, then self-reviews. User approved this.
- Working-tree wipe incident in P4a: all tracked files went 0 bytes (node_modules stayed 1014M, `git fsck` clean, HEAD intact `0ef925d`). Recovered via `git checkout -- .`. Cause unknown, likely OOM/crash during provider flake. Verified `git status` clean after. Monitor.
- Turnstile test pair for E2E: sitekey `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA` via env override on dev process.
- Branch discipline: P3b's plan was committed to `main` by mistake (docs-only), fixed by `git checkout -b feat/crm-core && git branch -f main origin/main`.

## Open backlog

- [ ] Dependabot: 68 vulns (37 high) — dedicated PR
- [ ] Turnstile replay-guard 400 + browser TKT success card probes
- [ ] Staging browser probes (authenticated cross-client, payment UI, print) — documented as gaps in `docs/invoices/README.md`
- [ ] P5b (lifecycle emails) prerequisite: `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + verified `no-reply@redwan.work`; P5c consolidation (dead code, duplication clusters, H1 retitle)
- [ ] `.superpowers/sdd` reports were accidentally committed in `2b05794` (no `.gitignore` rule) — add ignore, untrack
- [ ] Former 0-byte wipe — monitor for recurrence

## Git state at handover (for verification)

```
main: ab2f0d2 Merge feat/projects-files: projects & files with archive flow (Phase 4a)
feat/p5a-security-hardening: 2f724d0 docs(plan): add phase 5a security hardening plan (+ uncommitted 0014 work)
Supabase: migrations 0001-0006 applied both sides; 0014 pending push
Supabase project: cqxtmzzlywolulechcob
```

New session: start with `git status --short --branch && git log --oneline -3` and reading the plan + ledger, then resume Task 1 verification per above.

