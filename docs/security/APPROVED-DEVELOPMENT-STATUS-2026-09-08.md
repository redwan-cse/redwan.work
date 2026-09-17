# Approved development status: 2026-09-08

This is a branch implementation and verification record, not a release approval. Main remains 27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a. No production migration, merge, deploy, real account mutation or storage deletion was performed.

## Verified development branches

PR #49: invoice quantity validation, preserving cent arithmetic. Its invoice workflow passed before the following stack; browser and full financial journey acceptance remain.

PR #50, head 7f1de0f3cfeaa31658f9fdcd574a40050f3c232a: contact HEAD namespace repair, fail-closed contact IP/replay controls, per-key deletion acknowledgement, incomplete storage cursor refusal, framework configuration, scoped/MIME/actual-size attachment checks, shared presign controls, atomic ticket/message/file persistence, locked quotas and request identities, fixed ticket errors, admin ticket uploads, truthful shared-file UI, retry-preserving new-ticket form. Unit regressions, lint, types, build, invoice tests and disposable transaction/concurrency/rollback tests passed.
Evidence: https://github.com/redwan-cse/redwan.work/actions/runs/34188289719 and https://github.com/redwan-cse/redwan.work/actions/runs/34188289751/job/101940948525 .

PR #51, head b06e8637741e5067a8908138feea96ebc1d9253a: client project progress/milestones, profile editing, paginated client/project views, project-scoped invoice listing/creation, atomic milestone draft snapshots and retries, retention/deletion design boundary. Unit authorization regressions, lint, types, build and disposable milestone billing/concurrency/retention-reference tests passed.
Evidence: https://github.com/redwan-cse/redwan.work/actions/runs/34188490073 and https://github.com/redwan-cse/redwan.work/actions/runs/34188489976/job/101941598991 .

PR #52, head b86ce1ab93f5ea3501389f3d1c34d85332d4d826: live-profile/matching-role RLS across nine tables, monotonic token cutoff, PR #48 session/proxy integration, removal of signOut(UUID), Auth ban/unban ordering with partial-state feedback, protected administrator onboarding. Unit regressions, lint, types, build and disposable nine-table RLS/ownership/cutoff tests passed.
Evidence: https://github.com/redwan-cse/redwan.work/actions/runs/34188683053 and https://github.com/redwan-cse/redwan.work/actions/runs/34188683034/job/101942079947 .

PR #53: exact contact checkbox serialization and explicit server consent, fixed-category email diagnostics. Source commit 3dc65eeb02893e6de4e5c193c12e0fd027fcd47f was inspected: three files, only the intended consent/redaction changes. The temporary source-edit job's write permission was then removed. Fresh-head consent/redaction regressions and all inherited checks must finish after this report commit; do not infer a pass from an earlier head.

CodeQL and Semgrep passed on #50/#51/#52. Their separate AI-security checks failed; current failure logs are not available, so no unsupported-model explanation is assumed for these runs and no scanner is bypassed.

## Still incomplete, not silently deferred or claimed fixed

- #48: actual recovery-email/template acceptance remains failed, plus invitation/expiry-refresh and latest combined real-browser acceptance. Earlier generated-link preview tests are not actual mailbox acceptance.
- #30: recoverable project purge and financial dependency handling. The original storage-before-row purge remains unsafe on main and in the current stack; per-object acknowledgement alone does not resolve it.
- #43: complete safe database reference inventories and cleanup races. Storage cursor validation is only partial remediation.
- #38: durable event/outbox persistence, replay identity, render/provider failures and delivery outcomes. Current after()/floating-promise scheduling is not a durable queue; successful ticket retries can still schedule duplicate notifications.
- #44: complete bounded query/pagination and performance work beyond the new directory/project pages and per-page ticket-email deduplication.
- #41/#46: full historical documentation reconciliation and diagnostic audit beyond changed modules. Some old invoice UI copy still incorrectly says no email is sent.
- Account lifecycle: real Auth ban/refresh/invitation failure-path and partial-onboarding recovery tests; existing-account success wording must not imply an email was delivered.
- Client deletion: legal/financial holds, retention periods and erasure policy remain an owner decision. No destructive client-delete operation is implemented.
- Financial browser/DB end-to-end acceptance, real storage/hosting-limit acceptance, independent review, required-check settings, backup restoration, deployment/rollback and release sign-off remain.

## Stack and safety

These PRs currently target main but are stacked: #50 includes #49, #51 includes #50, #52 includes #51 and integrates the #48 application guards, and #53 includes #52. Their diffs therefore overlap; they are not independent merge candidates. Reconcile/retarget in dependency order after review. Migrations 0018-0020 are new forward-only branch files; applied migrations 0001-0017 remain unchanged. Do not merge any branch or run a remote migration without exact owner approval and verified recovery.
