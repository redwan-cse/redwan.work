# Completion and integration sequence

## Verified baseline and scope

Integrated application baseline: PR56 a8e6c8349adef339cf2dbfaf75d4a4c3ed93e3ea. Main: 27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a. Evidence collection: 19433e42de51dbeb779de585a49b64adeb300443 and fe9745c481a9fcee9caa7266b798ddefcbd7b726. Later commits add development verification/documentation, not production changes. Application acceptance passed on the baseline; new head checks must report their own results.

No main merge, PR closure/retargeting, protection modification, production mutation or remote migration is performed by this plan. PR27 remains owner-deferred. Old dependency PRs are inspected for sequencing, not silently authorized for mutation.

## Per-PR completion classification

| PR | State of work | Integration disposition |
| --- | --- | --- |
| #48 foundation | Original head tests passed; separate from integrated history | Trial merge has conflicts in lib/auth/session.ts and proxy.ts. Preserve integrated authority/caller-account-state behavior, not the older versions. Pinned real Auth tests already run in combined CI; missing credential-free bearer/server/browser and dependency audit coverage now runs via integrated-foundation-smoke.yml. Older framework/unit assertions require reconciliation before claiming complete foundation parity. |
| #49 invoice quantity | Implemented, tested; exact head is ancestor of PR56 | Included, no separate intermediate production deployment needed. |
| #50 submissions/storage | Implemented, tested; exact head is ancestor of PR56 | Included; descendant recovery/authority fixes must accompany release. |
| #51 client workflows | Non-destructive workflows implemented/tested; exact head included | Account erasure is still policy-gated, not claimed delivered. |
| #52 current authority | Implemented/tested; exact head included | Release with later proxy, Auth and file-boundary fixes. |
| #53 consent/diagnostics | Consent implementation included; current branch diverged by four diagnostic/evidence paths | Trial merge is clean. Preserve useful evidence in REVIEW-EVIDENCE-CAPTURE.md; integrated editor already retired. Do not import obsolete diagnostic workflows. |
| #54 recovery | Implemented/tested; exact head included | Release with later original-archive verification and confirmation locking. Hosted restore/retention gates remain. |
| #55 outbox | Implemented/tested; exact head included | Release with later recipient reauthorization. Production retry scheduling/retention remain unresolved. |
| #56 integrated remediation | All baseline app/SQL/Auth/mailbox/browser/storage/restore acceptance passed | Still not fully release-ready: foundation parity, residual service review, independent approval, actual protection rules and production gates remain. |
| #11 lodash 4.17.23 | Superseded: lodash is absent from both exact lockfiles | Recommend closure only after explicit confirmation; do not reintroduce removed dependency. |
| #12 Next 16.1.5 | Superseded: both lockfiles resolve Next 16.3.4 | Do not merge an older lockfile snapshot. |
| #14 ajv 6.14.0 | Superseded: both lockfiles resolve ajv 6.15.0 | No update needed from this old PR. |
| #16 minimatch | Superseded: both lockfiles include 3.1.5, 9.0.9 and 10.2.6 | Requested 3.1.5/9.0.9 upgrades are already present. |
| #27 legacy contact cleanup | Explicitly deferred, not declared complete from screenshot checkmark | Rebase/review after the approved remediation release only when owner resumes it. |

All #48-#56 remain drafts. Own-head passing tests prove their tested scope, not descendant work or production readiness. The failed GitHub-managed AI check remains failed and is not counted as independent approval. Advisory documentation does not substitute for reading actual branch rules.

## Confirmed graph

The complete 78-commit PR56 history and Git ancestry checks contain the exact current heads of #49, #50, #51, #52, #54 and #55. The common PR53 consent checkpoint c14d3890c5eda3a999ac212072f34654008df740 is included, but its four later diagnostic commits are not. #48 is separate. A local Git merge-tree inspection, without moving branch refs, found the two #48 conflicts and a clean #53 trial merge.

## Priority completion order

1. **P0, integration correctness:** preserve the current session/proxy implementation; finish foundation test parity on the integrated app. The dedicated smoke workflow restores bearer, actual production-server headers/routing, desktop/mobile auth-screen behavior and full dependency auditing using exact pinned foundation test sources. No foundation application source is copied. Preserve PR53 evidence without restoring expired tooling. These are the first changes made from this sequencing review.
2. **P0, remaining data safety:** complete the previously identified individual-file deletion lifecycle and compatibility-reader review. Keep the verified project recovery and financial protections intact. Do not let visible green checks hide unreviewed service behavior.
3. **P1, release acceptance:** resolve independent review and inspect actual required checks/reviews/rules. Verify production backup/restore, schema-first rollout, hosted R2/SMTP and durable email scheduling. Owner legal/account/archive/email retention choices remain required for destructive operations; do not fabricate them.
4. **P1, final integrated verification:** recheck current main and run all app/SQL/framework/browser/Auth/storage/restore checks on the exact candidate. Any changes reset the relevant evidence. Do not disable failed checks to manufacture readiness.
5. **Merge recommendation, after approval:** one reconciled integrated candidate via #56, rather than numerical deployment of older #49-#55 snapshots. Preserve merge history if the owner wants included PRs recognized through ancestry; do not assume squash merges close those PRs automatically. Confirm the actual integration method before merging. #48/#53 may need explicit superseded closure after useful differences are accounted for. Closing/retargeting multiple PRs requires a counted preview and confirmation.
6. **After release:** verify deployment and main scans, then close the four superseded dependency PRs with confirmation. Resume #27 only when explicitly authorized. This is a recommendation, not executed closure or merge.

## Verification boundaries

Baseline full acceptance: https://github.com/redwan-cse/redwan.work/actions/runs/34243466914/job/102119443905 . Baseline SQL through 0033: https://github.com/redwan-cse/redwan.work/actions/runs/34243466886/job/102119812683 . New foundation coverage and latest-head reruns must be checked separately.

The public-repository evidence job read Git objects and lockfiles and created temporary local merge objects, not commits on any branch. Its statuses only attest evidence collection. Temporary network/status-writing code is now retired. Main protection was historically inaccessible; no clean-access or enforcement conclusion is invented from Git ancestry. No production credentials or customer data entered these checks.
