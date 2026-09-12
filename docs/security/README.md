# Security: current evidence and historical context

This describes the unmerged development candidate, not a production certification. Canonical release tracker: [PR56](https://github.com/redwan-cse/redwan.work/pull/56). Criterion-by-criterion state and exact execution links: [M00 ledger](ACCEPTANCE-CLAIM-RECHECK-2026-09-09.md). Original audit issues28-47 remain open; superseded PR closures were consolidation, not completed acceptance or deployment.

## Current enforcement, with boundaries

- Current-account authority uses profile role/activity, Auth state and token cutoffs; protected actions/RLS must agree. Inspected setClientActive disables a client profile and applies an Auth ban, or removes the ban before activation. It does not call an admin sign-out API with a user UUID. Do not describe this as unconditional global session revocation.
- Service-only mutation RPCs, atomic quotas and financial invariants are implemented and have disposable acceptance evidence. A trusted helper lacking its own session parameter is not automatically a public bypass; every actual caller and built action manifest still needs complete inventory.
- Uploads use signed storage capabilities and confirm-time metadata/size/scope validation. A HEAD result is not malware scanning or proof of permanent byte immutability. Full ticket sharing/cancel/reload acceptance and abandoned unbound-key lifecycle remain separate work.
- File deletion preserves durable tracking and verified archive/recovery evidence before physical deletion. Disposable restore tests do not establish production backup/restoration readiness.
- Durable email outbox implements fencing, retries, recipient reauthorization and frozen-envelope idempotency. Hosted delivery, monitoring, production schema/scheduler and paid/void notification freshness remain open.
- Diagnostics must use fixed categories and approved safe correlation. Do not log raw original provider/database errors, and do not equate truncation with redaction. Remaining presign/email-log/Blogger/revalidate sinks are tracked source findings, not claimed observed production leaks.

## Approved wave

M00/A01/I01/I02 only: criterion tracking, canonical relative login return paths, explicit NDA intent including approved exact legacy compatibility, and optional whole-dollar USD budgets. Both budgets blank is allowed; otherwise both integer bounds0..10,000,000 with minimum<=maximum. No rounding, clamping, partial-range acceptance or existing-record rewrite. New forms send NDA true/false; exact legacy checked string is recognized, empty/omitted unchecked, unknown/duplicate/non-string rejected.

Implementation is not verification. Check the current head's actual action/parser, built-browser and disposable DB results before marking these stories Verified. Consent time/explicit consent have prior evidence; policy-version remains a failed criterion, with no schema/backfill authorized. Post-OTP recovery and logout redesign are outside this wave.

## Repository and production gates

CodeQL/Semgrep passes are exact-version scanner evidence, not an exhaustive semantic audit. The separate AI failure has no current established cause; historical model diagnoses are not transferable. Verified signatures are required on main; classic protection previously returned403, so required checks/reviews are Unknown where unreadable. No independent APPROVED review is established. Do not weaken protection or rewrite ancestors to make the candidate appear mergeable.

Production Auth origin/template correction remains unresolved. Outbox PGRST205 does not distinguish missing migration from cache/exposure configuration. R2 jurisdiction endpoint form is valid; hosted CORS, credentials, Vercel environment parity and production ledger are still unverified. Vercel Hobby scheduling and worker capacity need operational acceptance; the Supabase Cron installer remains inactive by default and unapproved for production activation.

Production database is live with irreplaceable data. Never reset, destructively migrate, replay migrations or restore unverified data. A verified backup and successful isolated restore are prerequisites to a separately approved rollout. Restored Cron must not call production. Main auto-deploys and requires explicit exact-head release confirmation.

## Historical records

The [pre-M00 security README](https://github.com/redwan-cse/redwan.work/blob/351b9dbb1a8e3aa5f91cf1b3dd72b0c3e89a3647/docs/security/README.md) preserves earlier probe tables and shipped-phase claims for provenance only. They are not new execution, current production proof, or permission to repeat live probes. The original sign-out API, all-shipped, raw-error logging and routine live-fixture statements are superseded by this document and the M00 ledger.

Use the [safe audit runbook](AUDIT-PLAN.md). Full semantic review of every feature/privacy document remains incomplete; preserve unknown historical consent/retention evidence rather than inventing policy or deleting production data to match old prose.
