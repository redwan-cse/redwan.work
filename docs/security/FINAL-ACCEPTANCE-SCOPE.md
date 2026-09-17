# Final acceptance scope and owner gates

This continuation completes the specifically outstanding draft project chooser and administrative diagnostic fixes in the integrated development branch. The original archive action was also found to differ from the verified purge backup; it now uses complete snapshots, safe ZIP paths, storage read-back and a locked snapshot-equality transition. The actual original archive API is exercised against disposable Supabase and S3 storage in addition to the previously passing purge/restore acceptance.

The implementation sequence is #49 invoice quantities, #50 submissions/storage, #51 client workflows, #52 current account authority, #53 consent/diagnostics, #54 recovery, #55 outbox/maintenance, and #56 integration and final hardening. #48 provides the separately verified foundation and pinned real Auth harness. Improvements made in descendants are not attributed as code changes to earlier branch heads. Old PR checklists must cite integrated descendant evidence explicitly.

PR #27 is expressly deferred by the owner. No reconciliation, merge, closure or source edits to #27 are authorized during this remediation pass. The four historical dependency PRs are not automatically approved for merge merely because the main remediation is tested.

Application acceptance includes current-head lint/types/build, focused runtime and static regressions, all disposable SQL suites, real Auth/JWKS, actual invitation and recovery mailboxes, browser expiry refresh, role changes and partial ban/unban failures, product journeys, signed private/public uploads, verified archives and complete restore. No production secrets or customer data are involved; exact fixtures and containers must be cleaned up.

Independent approval and production readiness are separate from successful implementation tests. GitHub-managed AI review still fails, and an earlier exact failed job was confirmed to reject its configured model before review. Administrator-only secret/dependency/protection inventories were inaccessible. Hosting cadence and legal financial/account/archive/email retention policy are not invented. Production CORS/CDN checks, backup restoration, merge/deploy and monitoring require their own access and explicit authorization.

No task is marked complete solely to make a progress count reach 100 percent. Source tests do not substitute for independent approval, a disposable restore is not production recovery evidence, and an unmerged branch fix does not close main's security alerts. Remaining policy/access/release gates must remain visible in the PRs.
