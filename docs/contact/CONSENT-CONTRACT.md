# Explicit versioned consent contract

## Authority and scope

The owner approved F20/I03 development integration on 28 September 2026: existing wording, no historical backfill, no production operations and no merge. [Issue45](https://github.com/redwan-cse/redwan.work/issues/45) and [PR57](https://github.com/redwan-cse/redwan.work/pull/57) are the existing trackers. Earlier ledger entries describing I03 as unauthorized are historical checkpoints, superseded only for this development scope.

No real policy is published or activated by this source. Migration0041 leaves `active_version` null. Neither an environment switch nor a client value can activate capture. Policy-copy approval, production schema application, deployment and activation remain separate.

## Display, request and evidence

`GET /api/contact` returns `{policy}` with `Cache-Control: no-store`, after server validation of the active database archive. The public bundle contains `version`, `checkbox`, `privacyNotice`, `attachmentNotice` and `policyText`. The form renders these strings as text, not HTML; it does not invent policy text or derive a version from the browser clock.

The browser submits exactly one literal `gdprConsent` and exactly one `consentPolicyVersion` identifying the bundle actually displayed when submission began. Only literal `true` is affirmative. Missing, false, alternate truthy spellings, duplicate, file-valued, malformed and unknown values are refused. Existing lead, budget, NDA and attachment validation remains in force.

The route calls `parseConsentedLeadPayload`, which combines the existing lead parser with the verified database control and canonical consent validator. A successful lead carries:

| Field | Authority |
| --- | --- |
| `consent_policy_version` | Exact active archived version |
| `consent_policy_hash` | SHA256 of the exact canonical archive bytes |
| `consent_capture_method` | Server constant `explicit-checkbox-v1` |
| `consent_at` | Server-generated UTC submission timestamp |

Wire timestamps, hashes and capture methods are ignored. Canonical schema1 JSON uses a fixed field order and preserves exact UTF8 text, including allowed line feeds. It does not trim, normalize or truncate wording. Invalid Unicode/control characters, oversized text, duplicate archives, unrelated versions and hash/canonical mismatches fail closed.

## Outcomes and stale-form recovery

Invalid consent/version input returns400, a recognized stale version returns409 `consent_stale`, and missing/disabled/unavailable/corrupt control returns503 `consent_unavailable`. No lead is inserted for these outcomes. Existing403 origin/security,429 rate-limit and502 persistence failures retain their meanings.

On409 the form preserves draft fields and uploaded attachment metadata in page memory, clears consent, displays the current bundle, announces the conflict and requires explicit rechecking. It never resubmits automatically. If activation changes after validation but before insertion, the database's PT409 refusal follows the same recovery path after one current-policy read, without retrying the insert.

On503 the form clears consent and active policy, keeps the draft/files, disables submission and offers an explicit reload. Policy reads have a bounded client timeout; superseded reads are aborted. Duplicate submit events are guarded before asynchronous token acquisition. This is in-memory preservation, not durable storage across page reload or browser closure.

## Database and historical meaning

Migration0041 adds nullable evidence columns, an immutable canonical archive, a singleton disabled-by-default control and service-only `contact_consent_control(text)`. The RPC returns at most the active archive plus the requested known historical archive in one statement snapshot. Anonymous/authenticated roles cannot call it; runtime roles cannot publish or activate policies.

A complete tuple must reference an archived version/hash pair and the expected capture method. On insertion the trigger locks the control row through commit, serializing both activation/insert lock orders. On update the original consent timestamp and tuple are immutable. Normal operational lead edits remain permitted under existing authorization.

Existing rows retain their exact timestamps and null evidence. A timestamp without a complete archived tuple means unknown policy agreement, never inferred consent. The disabled database state permits legacy null tuples for additive compatibility, but the new route never uses that as an acceptance fallback. Versioned inserts while disabled are refused.

Recorded evidence is not proof of reading, identity, legal sufficiency, marketing permission, current agreement or non-withdrawal. No historical UPDATE/backfill, policy seed, retention change or widened access is included.

## Rollout and recovery boundary

Migrations0001-0040 are unchanged; the reviewed development bootstrap now expects41 migration files. Do not replay or reset production. Before any real rollout, separately authorize and verify backup/isolated restoration, production migration reconciliation, lock impact, exact reviewed policy bytes, publication/activation ordering and application compatibility.

The new route must not be deployed alone against missing or disabled control: it intentionally refuses intake. An application rollback does not reverse the immutable evidence schema. Disabling future capture must not delete archives or rewrite existing evidence. Any production recovery is a separately approved operation using verified evidence, not a destructive down migration.

The existing form fallback says information is never shared with third parties, while `/privacy` describes provider disclosures. Both are unchanged. Resolve that copy with the owner before real policy publication; this implementation does not silently choose alternative wording.

## Development verification checkpoint

Source wiring is published at `36a623ef5ca065220ee64f0446f7fc05be533f41`. The actual-route regression ran against the old route with1 pass/7 failures, then passed8/8 after integration. The final local reader/intake/route/client command passed27/27 on Node22.23.1, with no skipped or cancelled tests. Next/Supabase/storage transports are synthetic adapters; the unexercised phone dependency is a throwing stub.

The desktop/mobile built-form suite covers unavailable-policy refusal, explicit reload, preserved fields/files, duplicate events, stale409, keyboard recheck, exact versions, one upload and server-issued reference. The forward SQL suite covers no backfill, bounded/service-only snapshots, immutable evidence and both activation lock orders. These browser/database executions require isolated CI; local syntax checks are not their acceptance.

The strengthened F20 challenge checks the actual wrapper called by the route, exact version/hash/method/server time, missing-version refusal, spoof resistance and form serialization. It does not substitute a dummy field or suppress failures. CI also covers real local route/storage/database persistence and candidate browser-to-database behavior. The source publisher is retired with read-only permissions; its historical success is not an acceptance result.

Exact final-head CI remains required; do not infer it from earlier helper-only commits or source publication. Self-review only, no independent review or production validation. AGY remains on hold; its old candidate-bound preparation package is not reusable. Original browserC/D/E acceptance is a separate unresolved workstream.

## Existing email diagnostic boundary

Email diagnostic text remains allowlisted. Known fixed outcomes and upstream handoff markers are retained; arbitrary provider/database messages become generic categories. Recipient addresses remain in the existing access-controlled email log, but bodies, tokens and raw provider diagnostics are not copied into error fields. This consent change makes no new email-delivery or durable-outbox acceptance claim.
