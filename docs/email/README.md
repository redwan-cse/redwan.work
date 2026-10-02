# Lifecycle emails

## Current contract (post-PR57)

This guide describes the source merged by [PR57](https://github.com/redwan-cse/redwan.work/pull/57) at [`432ee21`](https://github.com/redwan-cse/redwan.work/commit/432ee21cab42effc901ceec1ecc228a8a18d3f13), checked on October 2, 2026. The original Phase 5b guide is retained below as a historical record, not current operating instructions.

**CRM lifecycle notifications use the durable outbox.** Six application-rendered template types cover ticket creation/replies/status changes, deliverable uploads, invoice issuance and payment confirmation. Credential-bearing invitations and password recovery are owned by Supabase Auth, not by the CRM worker. Current behavior and configuration are defined by [Durable outbox](DURABLE-OUTBOX.md), [Request wakeups](DISPATCH-WAKEUP.md) and [Supabase Cron](SUPABASE-CRON.md).

### Persistence, dispatch and retries

- Lifecycle events are captured in the same database transaction as the CRM mutation. A rollback leaves neither the business mutation nor its event. Provider delivery runs separately; provider failure cannot undo an already-committed business action.
- `lib/email/outbox.ts` is the sole CRM transport. Legacy `sendEmail`/`sendXEmail` compatibility helpers in `lib/email/index.ts` do not send another copy.
- `queueEmail()` can wake a bounded drain through Next.js `after()` after a request. That is a latency optimization, not durable scheduling. An unavailable or terminated callback does not erase the stored event.
- The worker leases events with fencing, persists an immutable rendered envelope, and uses a stable `lifecycle/<event-id>` provider idempotency key. Ambiguous timeouts retry the same envelope and key. Outcome and audit persistence are coupled by the database RPC.
- Automatic retry is bounded at five attempts and 23 hours from the first attempt. Permanent failures, exhausted work and suppression need investigation, not blind business-action replays. **Do not re-send an invoice or re-invite a client just to retry its notification.**
- Recipient authority is rechecked before dispatch. Inactive or otherwise unauthorized recipients are suppressed; changed recipient addresses cannot reuse an old envelope to send private content.

The outbox states are `pending`, `processing`, `accepted`, `failed` and `suppressed`. **`accepted` means provider acceptance, not inbox delivery.** Auth invitation audit handoff is also not delivery proof. Resend bounce/delivery webhooks remain a separate integration boundary; historical viewer labels such as Sent or confirmed must not be interpreted as mailbox verification.

### Configuration and data boundaries

The app needs server-only `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, plus an explicit `NEXT_PUBLIC_SITE_URL` origin for email links. The intended production origin is `https://redwan.work`; the origin validator rejects missing or malformed origins rather than deriving links from request headers. Loopback HTTP is for disposable development/testing only, never the production setting.

`CRON_SECRET` protects the app's email-outbox route. The Supabase scheduler uses the matching credential in Vault as documented in [Supabase Cron](SUPABASE-CRON.md). Do not copy any secret value into this guide, SQL in the repository, screenshots, logs or CI. Production provider credentials and data do not belong in build or automated-test jobs.

Worker diagnostics expose fixed categories, not raw provider responses or mail content. Access-controlled recipient audit rows and private outbox payloads/envelopes still contain personal data and require an explicit retention policy. Do not export them as general diagnostic evidence.

### Scheduling and safe operational checks

The existing `supabase/operations/install_email_outbox_cron.sql` is an operator script, **not a migration**. It creates the named five-minute job inactive; reinstalling intentionally pauses a matching active job. Completing migrations does not install or activate this scheduler. Inspect the existing job and current hosting plan before proposing a change. Do not install, rotate secrets or activate as part of a documentation repair.

The repository's `vercel.json` already schedules R2 retention daily. Keep that separate from email scheduling. Neither cron endpoint is a health check: **GET `/api/cron/email-outbox` can send real mail; GET `/api/cron/r2-retention` can delete objects.** Both require the relevant operational authority, not an exploratory request.

The email worker attempts at most three events per call. A five-minute schedule alone permits at most 36 attempts/hour before failures and retries; request wakeups may add throughput. This is not a five-minute delivery SLA.

For authorized observation, use existing job/run records, HTTP status/error categories and the admin queue/audit views. Record oldest pending age, due/failed/exhausted work and the alert owner; alert well before the 23-hour retry horizon. Cron execution or `pg_net` enqueue success alone does not prove HTTP success. The email route returns 401 for bearer rejection and 503 for failed/deferred processing; a 200 is still not proof of inbox delivery. Never export queued headers, raw response bodies or recipient content.

### Current evidence and remaining Phase 0 work

PR57 is merged. The owner and AGY report production migrations through 0041 and policy activation completed on October 2. That report is retained as operator evidence, not a fresh inspection of hosted state. This documentation change does not replay migrations, reactivate policy, rerun old AGY packets or touch retained host resources.

Current deployed revision, actual outbox-job state, secret/configuration readiness, authenticated HTTP outcomes, queue progress, alert ownership and linked backup/restore/rollback evidence still need their specific hosted records before Phase 0 can be called complete. Reuse existing receipts and collect only missing facts. Production reads, sends, scheduler changes and host operations remain separately scoped; verify retained evidence before any separately authorized owner-host operation.

This is the first documentation slice of the existing [documentation issue #41](https://github.com/redwan-cse/redwan.work/issues/41), with [email issue #38](https://github.com/redwan-cse/redwan.work/issues/38) and [release-gate issue #39](https://github.com/redwan-cse/redwan.work/issues/39) still open. It does not close those obligations or claim a new runtime/production test pass. The next independent product slice is an approved design for authenticated profile password change, not a rewrite of password recovery.

## Archived Phase 5b reference

**Superseded operational guidance.** The original text below is preserved verbatim to retain its historical probe results and limitations. Its live-probe commands, re-trigger advice, no-retry claim, inactive-recipient behavior and request-derived-origin fallback are not current instructions. Do not execute them or transfer their checkmarks to the current build. Use the current contract and linked runbooks above.

<details>
<summary>Historical Phase 5b guide, retained for evidence only</summary>

# Lifecycle Emails (Phase 5b)

Transactional email for the CRM: seven lifecycle events, one audit row per event, and an admin viewer over the log.

## Overview

- **Provider:** Resend (`resend` npm package, pinned `6.25.0`), API sends only
- **Sender:** `RESEND_FROM_EMAIL` (verified domain required)
- **Audit table:** `public.email_log` — migration `0016_email_log.sql`, admin-SELECT-only RLS, writes via service-role. One row per lifecycle event, including events that never reached the provider.
- **Modules:** `lib/email/templates.ts` (render), `lib/email/index.ts` (send + log), `lib/email/recipients.ts` (recipient/link resolution), `lib/crm/email-log.ts` (read side)
- **Viewer:** `/admin/emails`

Supabase Auth's own credential-bearing mail (invite, set-password, reset) is relayed through Resend SMTP, configured dashboard-side in P3a. This app never renders or transmits those messages — see [Invite is logged, not sent](#invite-is-logged-not-sent).

## The seven events

| Template | Trigger | Recipient | Entity |
|---|---|---|---|
| `invite` | `inviteClient` / `convertLead` (`lib/crm/clients.ts`) | invited client | `client` |
| `new-ticket` | `createTicket` (`lib/crm/tickets.ts`) | every active admin | `ticket` |
| `reply-posted` | `adminReply` | the ticket's client | `ticket` |
| `reply-posted` | `clientReply` | every active admin | `ticket` |
| `status-changed` | `setTicketStatus` | the ticket's client | `ticket` |
| `deliverable-uploaded` | `confirmDeliverableAction` (`lib/crm/admin-actions.ts`) | the project's client | `deliverable` (file id) |
| `invoice-issued` | `sendInvoice` (`lib/crm/invoices.ts`) | the invoice's client | `invoice` |
| `payment-confirmed` | `confirmPayment` | the invoice's client | `invoice` |

Admin-directed events fan out to **every active admin** (`adminRecipients()`), so an alert never depends on one hardcoded mailbox.

## Enforcement model

### Fail-soft is the load-bearing rule

A send failure must never break the action that triggered it. Three mechanisms enforce it:

1. **`sendEmail` never throws and never rejects.** Invalid address, missing configuration, provider error, provider timeout — each returns `{ ok: false, error }` and writes a `failed` row.
2. **Every call site uses `queueEmail(() => sendX(...))`.** The thunk form matters: the 7 helpers are `async`, so a null field arriving from a DB row becomes a rejection rather than a synchronous throw, and `queueEmail`'s wrapper catches it. A direct `await` would not.
3. **`queueEmail` schedules through Next's `after()`.** A bare floating promise can be dropped when the response completes, which would lose both the email and its audit row. Outside a request scope (cron, scripts) it falls back to a guarded floating promise.

`sendToAll` fans out with `Promise.allSettled`, so one bad recipient cannot abandon the rest, and reports `ok` only when every recipient succeeded.

### Timeouts

- Provider send: 10s (`SEND_TIMEOUT_MS`)
- Audit insert: 5s (`LOG_TIMEOUT_MS`) — a stalled `email_log` write must not stall the action being audited

### Events that never reach the provider

Recipient or context resolution can fail before a send is attempted: no active admin to notify, a deleted auth user, an unreadable ticket or invoice. Those still write a `failed` row via `recordUnsent()`, with the reason in `error` — so the viewer distinguishes "resolution failed" from "never triggered". The log's guarantee is one row per *event*, not one row per provider call.

### What reaches the log

`to_email` (truncated 320), `template`, `entity_type`, `entity_id`, `resend_id`, `status`, `error` (truncated 500), `created_at`.

Never logged: subjects, bodies, filenames, amounts, invoice descriptions, payment references. `recordSend` enumerates its insert fields explicitly rather than spreading its argument, so the barrier does not depend on a caller being careful.

### HTML safety

Every interpolated value that reaches HTML passes through `escapeHtml` (subject lines interpolate raw — a subject is a header, not markup). Subjects, client names, filenames, and reply bodies are user-supplied and reach HTML, so an unescaped path would let a ticket subject inject markup into an admin's mail client. Reply previews are clipped to 300 characters before escaping.

## Invite is logged, not sent

Supabase Auth transmits the invitation itself. Sending our own would duplicate a credential-bearing email, so `inviteClient` and `convertLead` call `recordExternalSend()` instead — an audit row with no `resend_id`, because the id belongs to the SMTP transaction rather than to any API call we made.

`status: 'sent'` on such a row means **the upstream provider accepted the request** — not that the message was rendered, relayed, or delivered. That is a weaker claim than a `sent` row from `sendEmail`, which has a provider id behind it. The difference is carried by a `HANDOFF_MARKER` string in `error`, and the viewer renders it as a distinct **Handed off** state.

## Delivery classification

`email_log.error` is deliberately polymorphic, so the viewer derives a delivery class rather than reading `error IS NOT NULL` as a fault:

| `status` | `error` | Delivery | Viewer label |
|---|---|---|---|
| `failed` | anything | `failed` | Failed (red) |
| `sent` | `HANDOFF_MARKER` | `handoff` | Handed off (blue) |
| `sent` | any other non-null | `unconfirmed` | Unconfirmed (amber) |
| `sent` | null | `confirmed` | Sent (green) |

Reading `error IS NOT NULL` as an error would show every successful invite as a failure. `unconfirmed` exists so an unrecognised diagnostic is surfaced rather than swallowed.

## Admin viewer — `/admin/emails`

Gated by `proxy.ts` (role check before render) and the admin layout's session + role check. The admin-SELECT-only RLS policy on `email_log` is defence in depth; reads themselves go through the service-role client like every other CRM module.

- Header: `N sent · N failed`, marked "(filtered)" when a template or recipient filter is active
- Filters: status pills, template pills, recipient substring (GET form)
- Columns: Sent at (UTC), Recipient, Template, Entity, Delivery, Detail
- Detail is delivery-aware: provider error for failed and unconfirmed, an explanation for handoff, the Resend id for confirmed
- Ticket and invoice entities link to their admin detail pages
- 25 rows/page, ordered `created_at desc, id desc` (the id tiebreaker keeps paging stable when timestamps collide)

Unknown filter values are ignored rather than rejected, matching the ticket inbox's `?status=bogus` behaviour. Duplicated params (`?email=a&email=b`) are ignored the same way. Recipient filters escape `\`, `%`, `_`, and `*` — PostgREST rewrites `*` to `%` for `ilike`, so it must be escaped alongside SQL's own wildcards.

## Configuration

```env
RESEND_API_KEY=          # server-only
RESEND_FROM_EMAIL=       # verified sender, e.g. no-reply@redwan.work
NEXT_PUBLIC_SITE_URL=    # origin for links in emails
```

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` must be set in `.env.local` and in Vercel.

**`NEXT_PUBLIC_SITE_URL` must be the production origin in Vercel** (`https://redwan.work`). Email links come from it first, so a local value like `http://localhost:3000` deployed to production would send clients unreachable links. Leaving it unset falls back to request headers, then to `https://redwan.work`. Without them, `isEmailConfigured()` is false: no send is attempted and every event writes a `failed` row with `Email is not configured` — visible in the viewer rather than silently skipped.

## Probe matrix

Run against the live Supabase project and the live Resend account. Live sends were routed to the verified sender address so no third party was contacted.

| Area | Probe | Result |
|---|---|---|
| Schema | service-role insert; unknown `template`/`status` rejected (23514) | ✅ |
| Schema | admin JWT SELECT / client JWT SELECT / anon SELECT / client INSERT | ✅ 1 row / `[]` / `[]` / 403 |
| Templates | all 7 render a subject + full HTML document | ✅ |
| Templates | hostile `<img src=x onerror=…>` in name/subject/author/body/project/filename renders escaped, never raw | ✅ |
| Templates | 500-char reply body clipped with ellipsis | ✅ |
| Send | invalid recipient → `ok:false`, no provider call, `failed` row | ✅ |
| Send | key removed at runtime → `ok:false` `Email is not configured`, `failed` row | ✅ |
| Send | live send → provider id returned, `sent` row carries it | ✅ |
| Fail-soft | helpers are `async`; null `bodyPreview` rejects instead of throwing synchronously | ✅ |
| Fail-soft | non-string recipient guarded, returns `ok:false` | ✅ |
| Fail-soft | `queueEmail(thunk)` never throws at the call site | ✅ |
| Events | all 6 action-driven templates logged with the right entity | ✅ |
| Events | 2 provider rejections while all 6 triggering actions returned `ok` | ✅ |
| Fanout | fail + throw + success across 3 recipients → all attempted, aggregate reports `2/3 failed` | ✅ |
| Fanout | sends dispatched concurrently (0ms spread) | ✅ |
| Handoff | `sent` row with non-null `error` accepted; `status='failed'` queries unaffected | ✅ |
| Handoff | malformed address recorded as `unknown`, not as fact | ✅ |
| Viewer | all four delivery classes classified correctly; handoff not shown as a fault | ✅ |
| Viewer | pagination, ordering, page-2 disjoint from page-1, identical timestamps page without gaps | ✅ |
| Viewer | status/template/recipient filters; bogus and duplicated params ignored | ✅ |
| Viewer | `%`, `_`, `*` escaped; literal substring still matches | ✅ |
| Viewer | page 0 / NaN / unsafe-integer → 1; past-the-end returns empty, not 500 | ✅ |
| Viewer | filtered counts agree with the filtered page | ✅ |
| Viewer | a failed count query renders `—`, never `0` | ✅ |
| Unsent | resolution failure writes a `failed` row with its reason | ✅ |
| No-op | re-selecting the current ticket status sends nothing | ✅ |
| Route | unauthenticated `GET /admin/emails` → 307 `/login?next=…` | ✅ |

All fixtures deleted after each run; `email_log` returned to 0 rows.

### Not verified

- **Authenticated admin UI render.** No Chromium in the build environment (same gap as P4a/P4b). Module logic and the unauthenticated redirect are covered; the rendered table is not. Verify by clicking through `/admin/emails` once as an admin and once as a client.
- **`after()` under real Vercel serverless.** Verified under `next dev` and `next start` locally.
- **Deliverable-uploaded via the server action.** The action needs a real admin session the probe harness cannot mint; the send itself was verified at module level.
- **End-to-end delivery to a real client mailbox.** All live sends went to the verified sender.

## Residual risks

- `HANDOFF_MARKER` is matched by exact string equality — editing that sentence reclassifies historical handoff rows as `confirmed`.
- `Promise.allSettled` fans out concurrently against Resend's default 10 req/s; needs batching past ~10 active admins.
- `email_log` grows unbounded — no retention policy yet, unlike R2 objects.
- Email links come from `NEXT_PUBLIC_SITE_URL` when set, falling back to request headers for local development. If the env var is unset in production, a client-triggered event would derive an admin-bound link from that client's request headers.
- No bounce or complaint handling: Resend webhooks are not wired, so a hard bounce after a `sent` row leaves the log optimistic.

## Operator notes

- **Check `/admin/emails` first** when a client reports a missing notification. A `failed` row carries either the provider's error name (`rate_limit_exceeded`, `validation_error`, …) or a resolution reason (`Recipient unavailable`, `No active admin recipients`). An event with no row at all means the trigger never fired.
- **"Handed off" is not a failure.** It means Supabase Auth accepted the invite; check the Resend dashboard for the SMTP transaction.
- **Nothing retries.** A failed send stays failed; re-trigger the action (re-send the invoice, re-invite the client) to send again.
- **Deactivating a client does not stop email.** Sends resolve the recipient from `profiles`/auth at send time, but no event checks `is_active`.
- Sends never block a response, so a lifecycle email may land a moment after the UI updates.

</details>
