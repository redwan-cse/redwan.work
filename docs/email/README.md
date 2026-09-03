# Lifecycle Emails (Phase 5b)

Transactional email for the CRM: seven lifecycle events, one audit row per attempt, and an admin viewer over the log.

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
