# Phase 1 Completion Report — Supabase Leads Pipeline

> Date: 2026-08-24 · Branch: merged to `main` @ `87d2d0a` · Status: **SHIPPED TO PRODUCTION**
> Spec: `docs/superpowers/specs/2026-08-24-client-crm-design.md` · Plan: `docs/superpowers/plans/2026-08-24-phase1-supabase-leads.md`

## 1. Completed

### Infrastructure & data
| Item | Detail |
|---|---|
| Migration `0001_leads_and_rate_limits.sql` | **Pushed to remote project.** Tables `leads` + `rate_limits`, enum `lead_status`, sequence (TKT numbers start at 1000), atomic RPC `consume_rate_limit` |
| Security hardening (final review wave) | RPC EXECUTE revoked from `public`/`anon`/`authenticated`, granted to `service_role` only · arg guards (`window<1`/`max<1` → false) · index on `rate_limits.window_started_at` |
| RLS posture | Enabled on both tables, intentionally **zero policies** — anon/authenticated fully denied; only service role touches them |

### Application code (`main`)
| File | Role |
|---|---|
| `lib/supabase/admin.ts` | Server-only service-role client factory (`import 'server-only'` guard) |
| `lib/contact/lead-schema.ts` | Normalization/validation: E.164 WhatsApp (with `.isValid()`), budget clamps, invalid-date → null, salted SHA-256 IP hash, `consent_at` stamping |
| `lib/contact/lead-store.ts` | Service-role insert → returns `TKT-<n>` ref |
| `app/api/contact/route.ts` | Same-origin → Turnstile siteverify → memory + DB rate limits → replay guard → Supabase insert. **Google Forms sink retired entirely** (`LEADS_SINK` flag removed; missing Supabase creds now 500, no silent fallback); dual-write freeze-safety via `after()` became moot and was deleted with the legacy path |
| `components/enhanced-contact-form.tsx` | Raw field-name mirrors alongside Google entry IDs; success card shows server-issued ref |
| Docs | `docs/contact/README.md` + privacy page rewritten to match supabase-only reality |

### Environment (user convention adopted)
- Code reads: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `LEAD_IP_HASH_SALT`
- `.env.example` mirrors the live key-set 1:1; dead keys removed (`LEADS_SINK`, `GOOGLE_FORM_ACTION_URL`, `REVALIDATION_TOKEN`)
- Local `.env.local` filled; Vercel envs synced by owner

### Tooling
- Supabase MCP configured at `.opencode/opencode.json` (gitignored, token never committed) — **activates after opencode restart**

## 2. Validated (evidence-based)

| Check | Result |
|---|---|
| `npm run lint` + `tsc --noEmit` + `npm run build` | Green at every task gate, on final branch head, **and on merged `main`** pre-push |
| Happy path vs real Supabase | 5 submissions → `TKT-1000`…`TKT-1004` returned (insert + sequence + select working) |
| DB IP rate limit | 6th rapid submit → `429 Too many submissions` |
| Cross-origin rejection | POST without Origin → `403 Request origin not allowed` (re-verified post-retirement) |
| Turnstile gate | Fake token with real secret → `400 Security verification failed` (real siteverify path, not dev bypass) |
| PII discipline | Log scan: zero probe values; only statuses/error messages |
| Review process | Subagent-driven: fresh implementer + independent review per task (7 tasks, 3 fix rounds total), final whole-branch review → 8 findings all fixed & re-reviewed clean |

### Honest gaps (not locally probeable)
1. **Turnstile replay-guard 400** — requires replaying a genuine browser token; logic reviewed, env-gated correctly.
2. **Success-card TKT render in a real browser** — server response contract verified; UI render not walked.
3. **Vercel runtime** — deploy auto-triggered by push; confirm lead lands in Supabase Table Editor after first production submit.

## 3. Remaining Phases (approved roadmap)

| Phase | Scope | Depends on |
|---|---|---|
| **P2 — R2 foundation** | Provision public+private buckets, custom CDN domain, `lib/r2.ts` helpers, contact-form attachments, retention cron | R2 API tokens (keys already in env) |
| **P3a — Auth foundation** | `middleware.ts` session refresh + role guards, `profiles` table + admin bootstrap, login / reset-password / invite-accept pages, empty `(admin)` + `(client)` shells | Supabase Auth config (SMTP → Resend) |
| **P3b — CRM core** | `tickets`/`ticket_messages` schema + RLS, admin inbox/thread views, clients CRUD + invite, lead→client conversion | P3a |
| **P3c — Client portal v1** | Client-side ticket create/list/thread/reply | P3b |
| **P4a — Projects & files** | Projects + milestones, deliverables upload (admin), files browser (client) | P2 private bucket + P3a |
| **P4b — Invoices & payments** | Invoice builder w/ line items, manual payment reference submission, admin confirmation → `paid` | P4a |
| **P5 — Polish** | Resend lifecycle emails (invite/new-ticket/reply/status/deliverable/invoice/payment), public asset uploader, `email_log` viewer | P3b–P4b |

## 4. Recommended completion path

**Order: P3a → P3b → P2 → P3c → P4a → P4b → P5** *(spec default was P2-first; swapping is recommended)*

Why: the portal is the product goal — P3a/P3b unlock visible client value fastest, and nothing in P2 blocks them. P2 slots in just before P3c/P4a, which are the first consumers of private-bucket files; building `lib/r2.ts` once, right before its first real consumer, avoids speculative API design. Each phase stays one branch → one PR → verify loop (`lint`/`tsc`/`build` + probes) → explicit merge, exactly like Phase 1.

Per-phase kickoff checklist (same every time):
1. Brainstorm scope confirmation → spec delta if any → implementation plan (`writing-plans`)
2. Subagent-driven execution with task reviews (proven this phase)
3. Probe matrix incl. cross-client RLS checks in SQL editor
4. Docs under `docs/<feature>/` updated same-PR

### Housekeeping backlog (non-blocking)
- [ ] Dependabot: 68 vulns (37 high) — dedicated `npm audit` / dependency-bump PR
- [ ] Restart opencode → verify Supabase MCP connects
- [ ] After first production form submit: confirm row in Supabase Table Editor
- [ ] Later removals (per owner): none required today; `REVALIDATION_TOKEN`/`GOOGLE_FORM_ACTION_URL` may linger in dashboards until cleaned
