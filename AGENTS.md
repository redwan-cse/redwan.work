# AI Agent Guidelines for redwan.work

Welcome AI Assistant! This workspace represents a clean rebuild of the `redwan.work` portfolio and client CRM.

## Reference Codebase Location

The entire previous implementation is safely archived and accessible locally at:
```text
J:\DevDrive\redwan.work_old
```
Remote repository: `https://github.com/redwan-cse/redwan.work_old`

Whenever the user asks you to implement, scaffold, or refine a feature, **you should inspect the corresponding module in the old repository** for reference implementations, proven database schemas, API routes, security boundaries, and UI design patterns.

---

## Where to Look in `J:\DevDrive\redwan.work_old`

| What you need | Path in `redwan.work_old` | Description |
|---|---|---|
| **Database Migrations** | `supabase/migrations/` | 41 production SQL migrations (0001 to 0041) with RLS policies, RPC functions, and table definitions. |
| **Comprehensive Docs** | `docs/` | Deep documentation covering auth, CRM, email dispatch, invoices, R2 storage, and security audits. |
| **App Router Pages** | `app/` | `(admin)/`, `(auth)/`, `(client)/`, `api/`, `blogs/`, `contact/`, `resume/`, `portfolio/`, `services/`. |
| **Reusable UI Components** | `components/` | shadcn/ui components, modal dialogs, CRM tables, invoice viewers, ticket threads. |
| **Core Utilities & Clients** | `lib/` | Supabase SSR clients, Cloudflare R2 presigned URLs, Resend email dispatchers, Blogger API wrappers. |
| **Environment Template** | `.env.example` | Complete list of required environment variables and descriptions. |

---

## Technical Baseline & Standards

When building the new project:
1. **Framework:** Next.js (App Router), TypeScript (strict mode).
2. **Styling:** Tailwind CSS, shadcn/ui components, Lucide icons.
3. **Database & Auth:** Supabase (PostgreSQL with Row Level Security, SSR auth package).
4. **Storage:** Cloudflare R2 (presigned URL uploads and private bucket isolation for client deliverables).
5. **Security:** Never commit secrets; use strict input validation (Zod); enforce RLS policies and atomic RPCs for critical operations (invoicing, payments, file management).
6. **Architecture Docs:** Refer to [`docs/LEGACY_ARCHITECTURE.md`](./docs/LEGACY_ARCHITECTURE.md) for full context on each subsystem.

## Mandatory v2 quality and release contract

Follow `docs/QUALITY_GATES.md` and `.github/quality-contract.json`. Missing application tests are a failed gate, never a skipped success. The gate's own unit tests do not constitute app testing. Use the approved current design and small test-first stories; report exact-head evidence and unresolved risks. Do not weaken workflow, test, receipt, migration or review rules to obtain green CI. Do not invent professional credentials, customer reviews, case-study outcomes or production verification.

Use synthetic data and supported Supabase publishable/secret API key types issued only for freshly provisioned disposable fixtures, never the current project's retained or production credentials. Verify authentication with supported SDK/JWKS methods. Never use production secrets, database resets, real mail, live uploads/deletions, or side-effecting health probes in CI. Preserve applied migration bytes. Development authority is not release authority: production-changing merges, deployments, migrations, scheduler activation and provider-setting changes need separately bounded approval. Do not use GitHub Copilot branches or assignments.
