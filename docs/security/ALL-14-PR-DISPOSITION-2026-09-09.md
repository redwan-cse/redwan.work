# All14 PR completion and consolidation record

Owner September9 at14:47 Asia/Dhaka explicitly includes all14 open PRs and lifts the PR27 deferral. Finish code and consolidate superseded work with evidence, not fourteen redundant deployments. Existing production retry restrictions remain: no Auth update, migration, live mail, scheduler activation or main merge is authorized by this code-completion instruction. Closures and merges require the applicable confirmation.

Shared Superpowers/Ralph/GSD plan: code completion -> integrated acceptance -> evidence-backed supersession -> remaining release gates -> separately confirmed deployment. Read/review work ran in parallel; implementation of the overlapping contact file was serialized. No independent agents or independent approval claimed.

## PR27 completed in integrated source

Commit5039df98d7ac7354eaa2b87577c7f155583b3a9d: https://github.com/redwan-cse/redwan.work/commit/5039df98d7ac7354eaa2b87577c7f155583b3a9d . Integration job https://github.com/redwan-cse/redwan.work/actions/runs/34331279657/job/102400198438 checks the exact inspected input blobs, reproduces legacy serialization red, applies only the contact component/docs cleanup, verifies exact FormData values/keys, runs lint/strict types/build and real desktop/mobile browser interactions before nonforced development-branch push. The actual committed two-file diff was inspected afterward. The one-shot branch-write workflow is now replaced by read-only repeatable acceptance; no Production environment/credential mapping.

Removed21 retired entry.* mirrors plus unused budgetRange/ticketId/userAgent fields and dead derived values/comments. Preserve budgetMin/budgetMax, source/device, every live parser field, explicit consent, attachment metadata and fresh Turnstile token. The browser shows only an actual successful server reference; rejected/missing-reference responses retain inputs and cannot display a fabricated ID. Desktop1280/mobile390 tests cover consent denial,503 failure, missing-reference refusal, successful server reference and horizontal overflow. Browser intercepts the local response and blocks third-party requests; this is not hosted Turnstile/R2 or actual database acceptance.

Review findings: unused mirrors removed; Forms/Apps Script comments removed; salt-optional suggestion rejected against current server evidence because hardened POST /api/contact explicitly requires LEAD_IP_HASH_SALT. Original PR27 branch9ec956e826dda07ae6852bc00be586f0840d989c remains unchanged; its objective/review repairs are superseded by the integrated source, not falsely claimed backported. Its three old review threads can remain as historical evidence when closed with a supersession explanation.

## Disposition of every PR

| PR | Current code disposition | Evidence / proposed action |
| --- | --- | --- |
| [11](https://github.com/redwan-cse/redwan.work/pull/11) lodash | Superseded on main | Frozen main27ab3e3 contains no lodash package. Close as superseded; do not reintroduce it. |
| [12](https://github.com/redwan-cse/redwan.work/pull/12) Next | Superseded on main | Main/candidate lock Next16.3.4 exceeds proposed16.1.5. Close; no downgrade. |
| [14](https://github.com/redwan-cse/redwan.work/pull/14) ajv | Superseded on main | Main/candidate lock ajv6.15.0 exceeds proposed6.14.0. Close; no downgrade. |
| [16](https://github.com/redwan-cse/redwan.work/pull/16) minimatch | Superseded on main | Main/candidate lock3.1.5/9.0.9/10.2.6 includes the requested fixed versions. Close. |
| [27](https://github.com/redwan-cse/redwan.work/pull/27) contact cleanup | Completed in56 |5039df9 removes dead fields/comments and fake references, actual browser/serialization tests before integration. Close as superseded in unmerged56, NOT deployed. |
| [48](https://github.com/redwan-cse/redwan.work/pull/48) quality foundation | Reconciled in56 | Preserve newer session/proxy/file responses; pinned foundation tests plus integrated actual framework/Auth/browser acceptance. Separate history, not exact ancestry. Close as reconciled in56. |
| [49](https://github.com/redwan-cse/redwan.work/pull/49) quantity | Exact head included in56 | b2919343d146adfdff92ed4471436aabe495fdd9 ancestor; exact decimal sweep plus actual1.001 browser invoice. Close as superseded in56 rather than release a duplicate snapshot. |
| [50](https://github.com/redwan-cse/redwan.work/pull/50) submissions/storage | Exact head included in56 |7f1de0f3cfeaa31658f9fdcd574a40050f3c232a; atomic/concurrent/retry/storage and browser acceptance. Close as superseded in56. |
| [51](https://github.com/redwan-cse/redwan.work/pull/51) client workflows | Exact head included in56 | b06e8637741e5067a8908138feea96ebc1d9253a; product/profile/progress/project invoice/milestone browser acceptance. Erasure remains policy-gated, not erased by closure. |
| [52](https://github.com/redwan-cse/redwan.work/pull/52) authority | Exact head included in56 | b86ce1ab93f5ea3501389f3d1c34d85332d4d826; RLS/account lifecycle/JWKS/browser/refresh tests. Close as superseded in56. |
| [53](https://github.com/redwan-cse/redwan.work/pull/53) consent/diagnostics | Reconciled in56 | Consent implementation checkpoint included; late diagnostic/evidence divergence reconciled without reviving retired collectors. Four own review threads resolved/outdated. Not exact full-head ancestry. |
| [54](https://github.com/redwan-cse/redwan.work/pull/54) recovery | Exact head included in56 |71193183dd974040769f4f32ccb9a2c7fdec9adb; complete archive/physical storage/restore/financial-refusal tests. Review threads refreshed: none. Production restore remains separate. |
| [55](https://github.com/redwan-cse/redwan.work/pull/55) durable outbox | Exact head included in56 | d4fcd550fed53bfe56119a91488822ea51e59b4d; lifecycle/lease/fencing/recipient/retry tests plus inactive five-minute Cron implementation. Production activation not complete. |
| [56](https://github.com/redwan-cse/redwan.work/pull/56) integrated candidate | Keep open | Sole release candidate, now includes27 objective. Await final-head checks and real release gates; not merge-ready merely because other PRs close. |

Proposed consolidation: close13 PRs11/12/14/16/27/48/49/50/51/52/53/54/55, keep56 open. Preserve all branches/history and evidence; no branch deletion, merge, issue auto-closure or false release status. Closing superseded PRs is organizational completion, not deploying their code. Each closure should link this record and the replacement/main evidence. No closure executed by this document.

## Acceptance and remaining gates

Prior exact integrated38d38272636d08876868765cfba5ba7edb8cf453 passed all application/database/browser/build/CodeQL/Semgrep tests: combined https://github.com/redwan-cse/redwan.work/actions/runs/34317580841/job/102357006197 ; SQL https://github.com/redwan-cse/redwan.work/actions/runs/34317580808/job/102356937246 ; foundation https://github.com/redwan-cse/redwan.work/actions/runs/34317580832/job/102356936719 ; regression https://github.com/redwan-cse/redwan.work/actions/runs/34317580788/job/102356936754 . Those are the pre-contact baseline, not substituted for final-head acceptance.

The new contact workflow runs acceptance and six-head ancestry/frozen-main dependency reconciliation as independent parallel jobs. Latest outcomes must be read before closing the evidence loop. App code changes are tested on the integrated candidate, not replayed over every older branch. The final PR tracker will hold exact final head/results.

Unresolved release gates remain on56: production Auth origin/template correction (no retry authority), outbox schema-cache absence/actual migration ledger, production backup plus isolated restore/upgrade rehearsal, hosted R2 jurisdiction/CORS and Vercel environment parity, live mail acceptance, Vault/Cron activation and monitoring, signature-compliant merge method, inaccessible classic protection and independent review. The AI service still fails; it is neither a passed review nor automatically a proven mandatory gate. No independent APPROVED review found. Current main remains27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a.

Retention/erasure choices are explicitly separate owner decisions. No reset, destructive migration, broad production write, actual mail, R2 upload/delete, scheduler call or rule weakening occurred. Checklist counts in screenshots are not evidence these gates were resolved.
