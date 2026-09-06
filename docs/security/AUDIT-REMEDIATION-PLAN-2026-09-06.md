# Audit remediation and production-readiness plan

Date: 2026-09-06. Audited baseline: `d4b2b3fa2037dd493051564abe070a17900856b3` on main. PR #27 was reviewed separately at `9ec956e826dda07ae6852bc00be586f0840d989c` and remains unmerged.

## Purpose and authority

Move from a portfolio/full-stack prototype toward a dependable service for direct clients. The owner approved publication of twenty sanitized finding trackers and this plan on a documentation-only branch. This does not authorize implementation, migrations, PR creation/merging, deployment or production mutation. Every main push auto-deploys and needs separate explicit approval.

The source audit identified 2 Critical, 14 Important and 4 Minor findings. Release sign-off was withheld. The detailed report is held separately by the owner; do not copy sensitive evidence, exploit steps or private attachment links into this public repository. Follow SECURITY.md for confidential reporting.

## Evidence limits

The expected main commit was confirmed through GitHub. Core source, all 17 migrations and related contracts were inspected. A few dependency-free predicate checks ran, but this was not an executed full-project production audit. No local checkout, npm, linked Supabase CLI, browser, real mailbox or network-enabled shell was available. Live HTTP, database, storage, account and baseline build probes remain unverified. Historical green documentation is not current execution evidence. No production fixtures were created and no production zero-count sweep was claimed.

Current audit outcomes are a release-planning baseline, not a claim of actual compromise or historical data loss. No code or applied migration was changed by this publication.

## Finding trackers

| Reference | Severity | Tracker |
|---|---|---|
| F01 | Critical | [Authorization lifecycle verification](https://github.com/redwan-cse/redwan.work/issues/29) |
| F02 | Important | [Session lifecycle and recoverable transitions](https://github.com/redwan-cse/redwan.work/issues/28) |
| F03 | Critical | [Recoverable, dependency-aware cleanup](https://github.com/redwan-cse/redwan.work/issues/30) |
| F04 | Important | [Contact attachment acceptance](https://github.com/redwan-cse/redwan.work/issues/31) |
| F05 | Important | [Consistent attachment confirmation](https://github.com/redwan-cse/redwan.work/issues/37) |
| F06 | Important | [Client-facing failure responses](https://github.com/redwan-cse/redwan.work/issues/34) |
| F07 | Important | [Persistent abuse-control failure behavior](https://github.com/redwan-cse/redwan.work/issues/35) |
| F08 | Important | [Framework and hosted upload limits](https://github.com/redwan-cse/redwan.work/issues/32) |
| F09 | Important | [Atomic ticket and attachment accounting](https://github.com/redwan-cse/redwan.work/issues/33) |
| F10 | Important | [Partial object-deletion reconciliation](https://github.com/redwan-cse/redwan.work/issues/36) |
| F11 | Important | [Complete retention inventories](https://github.com/redwan-cse/redwan.work/issues/43) |
| F12 | Important | [Durable lifecycle email traceability](https://github.com/redwan-cse/redwan.work/issues/38) |
| F13 | Important | [Independent release quality gates](https://github.com/redwan-cse/redwan.work/issues/39) |
| F14 | Minor | [Documentation reconciliation](https://github.com/redwan-cse/redwan.work/issues/41) |
| F15 | Minor | [Obsolete upload action consolidation](https://github.com/redwan-cse/redwan.work/issues/42) |
| F16 | Important | [Privileged account protection in onboarding](https://github.com/redwan-cse/redwan.work/issues/40) |
| F17 | Minor | [Bounded CRM listing work](https://github.com/redwan-cse/redwan.work/issues/44) |
| F18 | Important | [Structured diagnostic redaction](https://github.com/redwan-cse/redwan.work/issues/46) |
| F19 | Minor | [Attachment sharing/removal semantics](https://github.com/redwan-cse/redwan.work/issues/47) |
| F20 | Important | [Consent submission and recording contract](https://github.com/redwan-cse/redwan.work/issues/45) |

## Dependency-ordered remediation proposal

1. **Verification baseline: F13/F14.** Re-read current AGENTS.md and AUDIT-PLAN.md in an authorized checkout. Establish exact branch state, current scanner inventories, required checks, dependency versions, clean build and isolated staging. Capture raw redacted evidence. No automated implementation is authorized.
2. **Account authority: F01/F02/F16.** Review account lifecycle, role synchronization and read/write access together. Preserve approved dual role storage and ownership isolation. Changes to database policy must be forward-only and separately reviewed.
3. **Recovery and retention: F03/F10/F11.** Define financial dependencies, complete inventories, per-object outcomes and recoverable cleanup before irreversible work. Verify backup integrity and failure behavior with disposable staging data. Do not silently change accounting retention.
4. **Attachment and abuse contracts: F04/F05/F07/F08/F15.** Align actual entry points with shared validated contracts. Verify namespace, metadata, persistent budgets, framework settings and hosting boundaries independently.
5. **Transactional workflows and diagnostics: F09/F06/F18/F20.** Couple persistence and retries safely, standardize public responses, redact diagnostics, and record the submitted consent accurately. Include concurrency and injected-failure tests.
6. **Email traceability: F12 with F18.** Keep business operations fail-soft while tracking event outcomes durably and preventing duplicate sends. Test local renderers separately from external invitation delivery. Define timeout ambiguity and reconciliation.
7. **Usability and scale: F17/F19.** Measure list completeness/cost and make attachment UI state truthful. Resolve operational decisions with the owner rather than inventing product policy.
8. **Close-out: F14/F13.** Reconcile docs after verified fixes, complete every runbook check, and reconsider PR #27 and main release sign-off separately.

## Subsequent 2026 plan-gap review

Read-only review: map all available 2026 changes, original plans and follow-up decisions against complete direct-client journeys. Preserve context and distinguish implemented behavior from proposals and historical assertions. Compare public site, enquiry, onboarding, account lifecycle, project delivery, support, files, invoicing/payment tracking, communication, retention and recovery.

For each subsystem produce a keep / improve / reconstruct recommendation with commit/source evidence, user impact, dependencies, migration/recovery implications and estimated scope. Do not recommend a rewrite merely because earlier work used a different model or tool. Prefer targeted reconstruction where boundaries or invariants are unsound; preserve validated components. This review is not permission to implement those recommendations.

## Operational decisions still needed

Define email audit retention, inactive-client notification policy, bounce/complaint and ambiguous provider outcomes, environment-specific email origins, recipient fan-out limits and operational ownership. Verify backup/restore and deletion policies against business and accounting obligations. Do not invent historical consent or assume an absent record proves an event never happened.

## Required verification

Follow AUDIT-PLAN.md in order. Every result must distinguish source inspection, isolated execution, live execution, historical evidence and unavailable tests. Capture commit, environment, tool version, command, exit code, HTTP code or SQL count as appropriate. Never expose secrets, access tokens, signed URLs or client data.

- Clean dependency install, lint, typecheck, production build, dependency audit, scanner inventories and branch controls.
- Anonymous, active/inactive, changed-role and cross-client access across UI, APIs, server actions and database boundaries.
- Negative direct writes plus valid financial transaction, concurrency and cascade behavior in a safe environment.
- Actual upload/confirmation/download byte checks, MIME/type/size boundaries and admin UI workflows.
- Lifecycle event outcomes, generic error handling, redacted logging, mailbox delivery and audit completeness.
- Production header configuration, safe read-only reachability checks, deployment evidence and documented rollback.
- Backup integrity, retention completeness, failure recovery and fixture cleanup evidence.

New-format Supabase publishable/secret keys only. Keep applied migrations 0001-0017 byte-identical. No production reset, destructive migration or broad cron invocation as an audit probe. Any production mutation requires a verified backup, exact authorized scope and recoverable procedure. Use synthetic ...@example.test fixtures; authorize and delete only those fixtures, with exact post-cleanup evidence.

## Branch housekeeping

At inspection, four branch tips matched their merged PR heads: docs/security-refresh (#26), fix/blogger-excerpt-sanitization (#25), feat/dependabot-fixes (#24), feat/security-scanning (#23). Deletion was requested but cannot be performed through the available connection. They were not deleted. Recheck their tips and merged status before manual deletion.

Preserve main, cleanup/contact-legacy-payload (#27), the four open Dependabot PR branches pending supersession review, and this new documentation branch. No PR was closed or merged by this publication.

## Release decision

Not ready for a new release on the audited evidence. Close Critical findings with verification, resolve or explicitly accept Important risks, triage outstanding security outcomes and execute the unavailable gates. Scanner success alone is insufficient. This plan is not an instruction to shut down production or alter any live setting.
