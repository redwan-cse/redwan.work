# CRM Core (Phase 3b)

Admin CRM foundation layered on the Phase 3a auth base: tickets with threaded messages and author-driven status automation, lead→client conversion, client management (invite / deactivate / reactivate), and a shared ticket numbering sequence that includes contact-form leads.

## Overview

- **Schema:** `supabase/migrations/0003_tickets_and_messages.sql` — enum `ticket_status` (`open` | `answered` | `awaiting_client` | `closed`), `public.tickets`, `public.ticket_messages`, RLS enabled on both
- **Server modules:** `lib/crm/` — `tickets.ts` (inbox/thread/reply/status), `clients.ts` (invite/activation/conversion), `leads.ts` (recent-leads summary), all returning `CrmResult`; admin entry points in `lib/crm/admin-actions.ts`
- **Admin UI:** `/admin` (Overview stats + recent leads + Convert), `/admin/clients`, `/admin/tickets` (+ `/admin/tickets/[id]` thread) — server components, `force-dynamic`, shadcn primitives
- **Auth:** every server action opens with a role check (`role === 'admin'` or `{ error: 'Unauthorized.' }`); origins for invite redirects come from request headers only, never client input

## Flows

### Numbering: one shared sequence

A single Postgres sequence `entity_number_seq` (starts at 1000) backs both tables: `leads.ticket_number` (migration 0001, contact-form leads) and `tickets.number` (migration 0003). Both display as `#TKT-<n>` in the admin UI, so leads and tickets share one visible numbering space — after lead #TKT-1004 the first probe ticket got #TKT-1005.

### Ticket lifecycle

Statuses: `open` → `answered` → (`awaiting_client`) → `closed`. Two forces move them:

1. **Automatic (trigger):** inserting into `ticket_messages` fires `apply_ticket_message_side_effects()`:
   - author is an **admin** → status flips to `answered`
   - author is the **client** (any non-admin) → status flips back to `open`
   - `last_message_at = now()` on every message, regardless of author
2. **Manual overrides:** the thread view's status select (`setTicketStatusAction`) can set any status directly — e.g. `awaiting_client` when waiting on the customer, or `closed` to archive without further automation.

The trigger is `SECURITY DEFINER` with an empty `search_path` because clients have **no** `UPDATE` policy on `tickets` — invoker-rights would silently skip the flip for client authors. This also makes it correct for P3c, when clients reply from the portal instead of service-key paths.

### Client portal flows (P3c)

Clients manage tickets from `/portal/tickets`: a "New ticket" dialog (subject ≤ 200 chars, body ≤ 10 000 chars) whose success path is the action's own redirect straight to the new thread, plus a thread view with an inline reply form. Statuses stay trigger-driven on the client side — a client reply flips `answered`/`awaiting_client` back to `open`, and replying to a `closed` ticket reopens it (same automation as above; closed threads show a muted note warning that a reply reopens them). The dashboard (`/portal`) shows the real own open-ticket count and the four most recently active threads; projects/invoices cards remain P4a/P4b placeholders.

Ownership is enforced in three layers, so no single mistake leaks another client's data:

1. **Action guard:** every client action resolves the caller through `requireClient()` — a valid session with `role=client` *and* `profiles.is_active=true`; the client id always comes from the session claim, never from posted input.
2. **RLS:** the migration-0003 policies still apply — clients can only select/insert rows tied to their own id, even if an action were ever bypassed.
3. **Ownership-scoped queries:** list/count/dashboard reads filter `.eq('client_id', <session id>)`, and thread/reply lookups compare the row's `client_id` against it, answering foreign ids with `Ticket not found.` (HTTP 404) instead of leaking existence.

Spam control: `createTicket` counts the client's tickets created in the rolling last 24 hours and refuses past 10 — *"You have created 10 tickets in the last 24 hours. Please reply to an existing ticket instead."*

### Lead conversion (`convertLeadAction` → `convertLead`)

Recent-leads table on `/admin` shows the last 5 leads; Convert is hidden once `converted_client_id` is set or status is `won`. The action:

1. Guards: lead exists, not already converted (`This lead was already converted.`), lead email valid.
2. **Refuses admin emails**: if the address belongs to an existing auth user whose role claim is `admin`, conversion aborts (`That email belongs to an admin account.`).
3. Fresh account → `inviteUserByEmail` with redirect to `<origin>/invite/accept`; existing non-admin user → claims it by setting the `client` role claim.
4. Upserts the profile (`role=client`; name/company copied only for fresh accounts).
5. Marks the lead `won` + sets `converted_client_id`.

### Invite client (`inviteClientAction` → `inviteClient`)

Same shape as conversion's account handling: valid-email check (`Enter a valid email address.`), duplicate guard (`That email is already a client.`), fresh-account invite or existing-user claim, then profile upsert. Deactivate/reactivate (`setClientActiveAction` → `setClientActive`) toggles `profiles.is_active`, scoped `.eq('role', 'client')` so admin rows cannot be touched even if an admin id were posted. Deactivation reuses the P3a proxy force-logout chain: the next request bounces to `/login?reason=deactivated` (see `docs/auth/README.md`, probe row 6).

### SMTP failure behavior (important local-dev caveat)

When the Supabase project's SMTP/Site URL config is broken (typical locally), `inviteUserByEmail` fails with `Error sending invite email` — and verification showed the auth user is then **not created at all**. The error surfaces correctly in the dialog; nothing partial is left behind. Production SMTP works end-to-end (proven in P3a), so this only affects local probes, which should pre-create users via the bootstrap script to exercise the reuse/claim branches instead.

## Runbook

All snippets read secrets from `.env.local` and never echo them.

### Seed tickets via REST (service key)

```bash
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
SK=$(grep '^SUPABASE_SECRET_KEY=' .env.local | cut -d= -f2-)
AUTH="apikey: $SK"; AH="Authorization: Bearer $SK"; CT="Content-Type: application/json"

# Create a ticket for an existing client profile id
TICKET_ID=$(curl -s -X POST "$URL/rest/v1/tickets" -H "$AUTH" -H "$AH" -H "$CT" \
  -H "Prefer: return=representation" \
  -d '{"client_id":"<client-profile-uuid>","subject":"Seed ticket"}' | jq -r '.[0].id')

# Add a client-authored message (trigger auto-flips status: client → open)
curl -s -X POST "$URL/rest/v1/ticket_messages" -H "$AUTH" -H "$AH" -H "$CT" \
  -d '{"ticket_id":"<ticket-uuid>","author_id":"<client-profile-uuid>","body":"seed"}'
```

Cleanup: deleting the ticket cascades its messages (`ticket_messages.ticket_id ... on delete cascade`).

```bash
curl -s -X DELETE "$URL/rest/v1/tickets?id=eq.<ticket-uuid>" -H "$AUTH" -H "$AH"
```

### Temp-admin pattern

Create a throwaway admin through the bootstrap script, probe, then delete the auth user (the `profiles` row cascades away).

```bash
node --env-file=.env.local scripts/bootstrap-user.mjs \
  --email temp-admin@example.com --password '<random>' --role admin --full-name 'Temp Admin'

# After probing: delete auth user (lookup by email via listUsers, then deleteUser)
node --env-file=.env.local -e '
  import("@supabase/supabase-js").then(async ({ createClient }) => {
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const { data } = await s.auth.admin.listUsers();
    const u = data.users.find((x) => x.email === "temp-admin@example.com");
    await s.auth.admin.deleteUser(u.id);
    console.log("deleted", u.id);
  });'
```

### Cross-client RLS probes

Sign in two different client accounts with password grants, keep each access token. Define `URL` and `CT` as in the seed snippet above (project URL / content-type header); keep the publishable key in a local untracked env file such as `.env.client-probe`:

```bash
PK=$(grep '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' .env.client-probe | cut -d= -f2-)
TOKEN_A=$(curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $PK" -H "$CT" \
  -d '{"email":"client-a@example.com","password":"<pw>"}' | jq -r '.access_token')

# Client A sees only own rows (expect: own ticket numbers only)
curl -s "$URL/rest/v1/tickets?select=number,status" -H "apikey: $PK" -H "Authorization: Bearer $TOKEN_A"

# Client A cannot read another client's thread (expect [])
curl -s "$URL/rest/v1/ticket_messages?ticket_id=eq.<client-b-ticket-uuid>" \
  -H "apikey: $PK" -H "Authorization: Bearer $TOKEN_A"
```

## Probe matrix

Executed on `feat/crm-core` (rows 1–16) and `feat/client-portal` (rows 17–22) against local dev + remote Supabase (all rows pass). Fixture UUIDs truncated; synthetic `example.com` fixtures only.

| # | Area | Probe | Expected | Observed |
|---|------|-------|----------|----------|
| 1 | Numbering | POST ticket after last lead (#TKT-1004) | number > 1004, shared seq | HTTP 201, number **1005** |
| 2 | Trigger | admin inserts message | status → `answered`, `last_message_at` bumped | both held; bump == message `created_at` |
| 3 | Trigger | client inserts message | status flips back to `open`, bump again | both held (second bump == new msg `created_at`) |
| 4 | Conversion | Convert click in dialog flow | action runs, row shows Converted + `won` badge after refresh | pass; DB verify: lead `status=won`, `converted_client_id` set, profile `role=client`, `is_active=true` |
| 5 | Conversion guard | convert already-converted lead from stale second tab | refusal surfaced in dialog | `This lead was already converted.` |
| 6 | Conversion guard | lead email belongs to an admin | refusal | enforced in module (`That email belongs to an admin account.`); UI path unexercised locally |
| 7 | Invite guards | invalid email `a@b` / duplicate client | server-side refusals in dialog | `Enter a valid email address.` / `That email is already a client.` |
| 8 | Invite reuse branch | invite existing *unclaimed* auth user | claim `client` role + upsert profile, Active row appears | pass; claim + profile verified over REST |
| 9 | SMTP failure | fresh-account invite with broken local SMTP | clean failure, no partial state | dialog shows `Invite failed: Error sending invite email`; **auth user NOT created** (REST-verified, Tasks 4 & 5) |
| 10 | Deactivate | deactivate active client, sign-in attempt | bounce to `/login?reason=deactivated` | notice rendered; sign-in blocked |
| 11 | Reactivate | reactivate, sign-in fresh context | lands on `/portal` | pass |
| 12 | Inbox filters | tab clicks + direct `?status=` incl. bogus value | correct subsets; unknown falls back to All | pass (`?status=bogus` → all rows) |
| 13 | Trigger via UI | admin reply in thread | badge + select flip to `answered` after revalidate | visible in-thread and in inbox filter counts |
| 14 | Manual override | select `awaiting_client` | persists across thread + inbox filter | pass |
| 15 | RLS | client token GET `/rest/v1/tickets` | only own rows (incl. persisted manual statuses) | exactly own 3 rows returned |
| 16 | RLS | client token GET other client's messages by `ticket_id` | `[]`, no leak | HTTP 200 body `[]` |
| 17 | Portal create | UI dialog: whitespace-only subject, then valid create + first message | server-side validation; success lands on new thread | `Subject is required.` rendered in dialog, no navigation; valid create → thread page (#TKT-n ref, Open badge, single client "You" bubble); list row href + UTC stamp correct; admin inbox shows subject + client name |
| 18 | Trigger via portal | admin replies in admin thread; client reloads thread | support message visible, chronological | pass (support-labeled bubble appended in order) |
| 19 | Reopen-on-reply | admin sets `awaiting_client`, then `closed`; client replies to each | reply flips status back to `open` both times | DB-verified `open` after each reply; badge updates in thread UI |
| 20 | Portal isolation | other-client ticket URL opened as B; B REST-reads A's messages by `ticket_id` | no access, no existence leak | HTTP 404 custom not-found page; REST body `[]`; B list/dashboard show only own rows |
| 21 | Rate cap | 10 tickets seeded via service key (+1 pre-existing), 11th create within 24h | refusal past cap, nothing inserted | exact cap string in dialog, no navigation; DB count unchanged by rejected attempt |
| 22 | Probe cleanup | delete all probe fixtures | cascades hold; zero fixtures remain | `ticket_messages` = 0 on deleted tickets; profiles + per-client tickets = 0 for all temp users |

Notes: trigger flips verified both directions at REST (Task 1) and through the real UI (Task 6); temp admins deleted after each probing session with cascade checks. P3c probes ran against the production build (`next start`) with three browser contexts (client A / client B / admin).

## Owner follow-ups after deploy

1. **Real conversion smoke-test:** convert one real lead from `/admin` once production SMTP is in play — the fresh-invite e2e path could not run locally because broken local SMTP fails the invite without creating the user (probe row 9). Confirm the invite email arrives, `/invite/accept` completes, and the lead shows Converted.
2. **Reset-link click-through:** request a recovery email for a real account and confirm the token-hash link lands on `/reset-password` and completes.
3. **Real-admin bootstrap** if not yet done: see the owner follow-ups in `docs/auth/README.md`.
4. **Resend-invite affordance** is a future nicety — today a lost invite email means converting/inviting cannot re-send to a claimed user; a small "resend invite" action would close that gap.
5. **Probe fixture note:** the `probe.client@example.com` fixture referenced in the committed plan docs was deleted from production on 2026-08-25; its historical password in those plan docs must be considered burned, and future probes should use locally-created fixtures with uncommitted passwords.

## Non-goals (explicitly deferred)

- **Attachments** → P4a/R2
- **Invoices** → P4b (the dashboard "Outstanding invoice" card is a placeholder)
- **Lifecycle emails / `email_log`** → P5
