# Phase 3c — Client Portal v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give invited clients a working portal: create tickets, list their own, read threaded conversations, reply (closed tickets reopen on reply) — plus a dashboard showing their real open-ticket count and recent tickets.

**Architecture:** Client mutations flow through `"use server"` actions gated by `requireClient()` (session role **and** fresh `profiles.is_active` — never trusting the proxy alone), calling ownership-scoped service-role functions in `lib/crm/tickets.ts`. Migration 0004 hardens the direct-REST surface P3b deferred: DB subject cap + BEFORE INSERT trigger overriding client-supplied `number`/`status` on non-service-role inserts. Approved 2026-08-25: reply-on-closed reopens (spec-literal); create redirects to the new thread; zero persistent probe fixtures.

**Tech Stack:** Next.js 16 App Router · React 19 `useTransition` direct-call pattern (repo ESLint rejects close-on-success effects) · supabase-js v2 service-role · Postgres CHECK + security-definer trigger · shadcn/ui. **No new npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-24-client-crm-design.md` (§5 Client portal, §3 triggers, §8 P3c). Attachments stay P4a; projects/invoices P4; notifications P5.

## Global Constraints

- Gate per task: `npm run lint && npx tsc --noEmit && npm run build` all green.
- One branch: `feat/client-portal`. Commits per task. No push/merge to main without explicit user confirmation.
- Env names locked; `.env.example` unchanged; secrets never printed/logged/committed.
- Never log PII — statuses and error messages only.
- **Zero persistent fixtures:** probe clients DELETED (auth user + cascade check) before a task reports DONE. Leave the pre-existing `probe.convert@example.com` account untouched.
- Untouched: `app/api/contact/**`, `lib/contact/**`, `lib/blogger.ts`, `(auth)` pages, `proxy.ts`, logout route, ALL admin surfaces (`app/(admin)/**`, `lib/crm/admin-actions.ts`, admin components).
- SQL LSP false positives on migrations — trust `npx supabase db push`.
- Dev server: `pkill -f '[n]ext dev'`; probes on localhost:3000 only.
- Success-handling in client components uses the `useTransition` direct-call pattern (see `components/admin/convert-lead-button.tsx`); form-ref `reset()` clears inputs on success only.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0004_tickets_hardening.sql` | subject CHECK + BEFORE INSERT defaults guard |
| `lib/crm/tickets.ts` (modify) | client-facing: createTicket, listOwnTickets, countOwnOpenTickets, getOwnTicketThread, clientReply |
| `lib/crm/client-actions.ts` | `"use server"`: requireClient, createTicketAction, clientReplyAction |
| `app/(client)/portal/layout.tsx` (modify) | NAV Tickets enabled |
| `app/(client)/portal/page.tsx` (modify) | real open count + recent tickets mini-list |
| `app/(client)/portal/tickets/page.tsx` | own-tickets list + New ticket entry |
| `app/(client)/portal/tickets/[id]/page.tsx` | ownership-checked thread + reply |
| `components/portal/new-ticket-button.tsx` | create dialog (client) |
| `components/portal/reply-form.tsx` | reply box (client) |
| `docs/crm/README.md` (modify) | client flows + probe rows + non-goals refresh |

---

### Task 1: Migration — tickets hardening (subject cap + insert guard)

**Files:**
- Create: `supabase/migrations/0004_tickets_hardening.sql`

**Interfaces:**
- Produces: CHECK `tickets_subject_length` (trimmed subject 1..200); `public.enforce_ticket_defaults()` (SECURITY DEFINER, pinned search_path) + trigger — non-service-role inserts get `number` from the shared sequence, `status='open'`, clock timestamps; service-role inserts untouched.

- [ ] **Step 1: Write the migration**

```sql
-- 0004_tickets_hardening.sql
alter table public.tickets
  add constraint tickets_subject_length
  check (char_length(btrim(subject)) between 1 and 200);

-- P3b review follow-up: direct REST inserts by authenticated clients must not
-- choose their own ticket number/status/timestamps. Service-role (all app
-- mutations) passes through untouched.
create or replace function public.enforce_ticket_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  new.number := nextval('public.entity_number_seq'::regclass);
  new.status := 'open'::public.ticket_status;
  new.last_message_at := now();
  new.created_at := now();
  return new;
end;
$$;

create trigger enforce_ticket_defaults_before_insert
  before insert on public.tickets
  for each row execute function public.enforce_ticket_defaults();
```

- [ ] **Step 2: Apply**

Run: `npx supabase db push` then `npx supabase migration list` — 0004 on both sides.

- [ ] **Step 3: Functional probe**

Create TEMP client: `node --env-file=.env.local scripts/bootstrap-user.mjs --email probe.p3c@example.com --password 'Probe-P3c-Only' --role client` (password never enters the report). Obtain an access token: `curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $PUB" -H "Content-Type: application/json" -d '{"email":"probe.p3c@example.com","password":"..."}'` → `.access_token`.

1. Hostile insert as CLIENT token: `POST /rest/v1/tickets` `{number: 999999999, status: 'closed', subject: 'probe', client_id: <own-profile-id>}` with Bearer token → row returns with `number` = next sequence value (NOT 999999999), `status='open'`.
2. Oversized subject as CLIENT token: subject of 250 chars → HTTP 400 with `tickets_subject_length` check violation.
3. Service-role insert unaffected: `POST /rest/v1/tickets` with service key `{client_id, subject:'probe-sr'}` → created normally (number from column default).
4. Cleanup: delete all three probe tickets (service-key REST), delete temp client auth user via one-off node eval (`admin.auth.admin.deleteUser`), confirm profile cascade.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_tickets_hardening.sql
git commit -m "feat(portal): harden tickets with subject cap and insert defaults guard"
```

---

### Task 2: Client-facing ticket functions + client actions

**Files:**
- Modify: `lib/crm/tickets.ts` (append)
- Create: `lib/crm/client-actions.ts`

**Interfaces:**
- Consumes: existing `ThreadMessage`, `crmError`/`CrmResult`, `getSupabaseAdmin()`, `getCurrentSession()` from `@/lib/auth/session`.
- Produces (tickets.ts additions):
  - `export interface PortalTicketRow { id: string; number: number; subject: string; status: TicketStatus; last_message_at: string; created_at: string; }`
  - `createTicket(clientId: string, subject: string, body: string): Promise<{ ok: true; ticketId: string } | { ok: false; error: string }>` — trims subject 1..200 / body 1..10000; spam cap: if client created ≥10 tickets in last 24h → error `'You have created 10 tickets in the last 24 hours. Please reply to an existing ticket instead.'`; inserts ticket `{client_id, subject}` then first message `{author_id: clientId}`.
  - `listOwnTickets(clientId: string, limit?: number): Promise<PortalTicketRow[]>` — `last_message_at desc`.
  - `countOwnOpenTickets(clientId: string): Promise<number>` — own + `status='open'`.
  - `getOwnTicketThread(clientId: string, ticketId: string)` — same success shape as `getTicketThread`; `crmError('Ticket not found.')` when missing OR `client_id !== clientId` (ownership enforced here, not just RLS).
  - `clientReply(ticketId: string, clientId: string, body: string): Promise<CrmResult>` — ownership check first, then trimmed-body insert (trigger reopens/maintains ticket).
- Produces (client-actions.ts, all `"use server"`):
  - `export type PortalActionState = { error?: string; notice?: string };`
  - `requireClient()` private: session role `'client'` AND fresh `profiles.is_active` read → session or null.
  - `createTicketAction(_prev: PortalActionState, formData: FormData): Promise<PortalActionState>` — fields `subject`, `body`; on success `redirect(\`/portal/tickets/${ticketId}\`)`.
  - `clientReplyAction(ticketId: string, _prev: PortalActionState, formData: FormData): Promise<PortalActionState>` — revalidates `/portal/tickets/${ticketId}` + `/portal/tickets` + `/portal`.

- [ ] **Step 1: Append client functions to `lib/crm/tickets.ts`**

```typescript
export interface PortalTicketRow {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  last_message_at: string;
  created_at: string;
}

const MAX_SUBJECT = 200;
const MAX_BODY = 10000;
const TICKET_CAP_24H = 10;

function trimField(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export async function createTicket(
  clientId: string,
  subject: string,
  body: string
): Promise<{ ok: true; ticketId: string } | { ok: false; error: string }> {
  const trimmedSubject = trimField(subject, MAX_SUBJECT);
  const trimmedBody = trimField(body, MAX_BODY);
  if (trimmedSubject.length === 0) return crmError('Subject is required.');
  if (trimmedBody.length === 0) return crmError('Message is required.');

  const admin = getSupabaseAdmin();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: capError } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', since);
  if (capError) return crmError(`Could not create ticket: ${capError.message}`);
  if ((count ?? 0) >= TICKET_CAP_24H) {
    return crmError(
      'You have created 10 tickets in the last 24 hours. Please reply to an existing ticket instead.'
    );
  }

  const { data: ticket, error: ticketError } = await admin
    .from('tickets')
    .insert({ client_id: clientId, subject: trimmedSubject })
    .select('id')
    .single();
  if (ticketError || !ticket) return crmError(`Could not create ticket: ${ticketError?.message ?? 'no row'}`);

  const { error: msgError } = await admin
    .from('ticket_messages')
    .insert({ ticket_id: ticket.id, author_id: clientId, body: trimmedBody });
  if (msgError) return crmError(`Could not create ticket: ${msgError.message}`);

  return { ok: true, ticketId: ticket.id };
}

export async function listOwnTickets(clientId: string, limit?: number): Promise<PortalTicketRow[]> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from('tickets')
    .select('id, number, subject, status, last_message_at, created_at')
    .eq('client_id', clientId)
    .order('last_message_at', { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`own tickets query failed: ${error.message}`);
  return (data ?? []) as PortalTicketRow[];
}

export async function countOwnOpenTickets(clientId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { count, error } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'open');
  if (error) throw new Error(`open-ticket count failed: ${error.message}`);
  return count ?? 0;
}

export async function getOwnTicketThread(clientId: string, ticketId: string) {
  const admin = getSupabaseAdmin();

  const { data: ticketData, error: ticketError } = await admin
    .from('tickets')
    .select('id, number, subject, status, last_message_at, created_at, client_id')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError) return crmError(`thread load failed: ${ticketError.message}`);
  if (!ticketData || ticketData.client_id !== clientId) return crmError('Ticket not found.');

  const { data: msgData, error: msgError } = await admin
    .from('ticket_messages')
    .select('id, body, created_at, profiles!ticket_messages_author_id_fkey ( full_name, role )')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (msgError) return crmError(`messages load failed: ${msgError.message}`);

  const messages: ThreadMessage[] = ((msgData ?? []) as unknown as Array<{
    id: string;
    body: string;
    created_at: string;
    profiles: { full_name: string | null; role: string } | null;
  }>).map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    author_name: m.profiles?.full_name ?? null,
    author_role: m.profiles?.role === 'admin' ? 'admin' : 'client',
  }));

  const row = ticketData as unknown as PortalTicketRow & { client_id: string };
  return { ok: true as const, ticket: row, messages };
}

export async function clientReply(
  ticketId: string,
  clientId: string,
  body: string
): Promise<CrmResult> {
  const trimmed = trimField(body, MAX_BODY);
  if (trimmed.length === 0) return crmError('Reply cannot be empty.');

  const admin = getSupabaseAdmin();
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, client_id')
    .eq('id', ticketId)
    .maybeSingle();
  if (!ticket || ticket.client_id !== clientId) return crmError('Ticket not found.');

  const { error } = await admin
    .from('ticket_messages')
    .insert({ ticket_id: ticketId, author_id: clientId, body: trimmed });
  if (error) return crmError(`Reply failed: ${error.message}`);

  return { ok: true };
}
```

- [ ] **Step 2: Create `lib/crm/client-actions.ts`**

```typescript
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { createTicket, clientReply } from '@/lib/crm/tickets';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type PortalActionState = { error?: string; notice?: string };

async function requireClient() {
  const session = await getCurrentSession();
  if (!session || session.role !== 'client') return null;

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_active')
    .eq('id', session.userId)
    .maybeSingle();
  if (profile?.is_active !== true) return null;

  return session;
}

export async function createTicketAction(
  _prev: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };

  const result = await createTicket(
    session.userId,
    String(formData.get('subject') ?? ''),
    String(formData.get('body') ?? '')
  );
  if (!result.ok) return { error: result.error };

  redirect(`/portal/tickets/${result.ticketId}`);
}

export async function clientReplyAction(
  ticketId: string,
  _prev: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };

  const result = await clientReply(ticketId, session.userId, String(formData.get('body') ?? ''));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/portal/tickets/${ticketId}`);
  revalidatePath('/portal/tickets');
  revalidatePath('/portal');
  return {};
}
```

- [ ] **Step 3: Gates**

Run: `npm run lint && npx tsc --noEmit && npm run build` — green.

- [ ] **Step 4: Commit**

```bash
git add lib/crm/tickets.ts lib/crm/client-actions.ts
git commit -m "feat(portal): add ownership-scoped ticket functions and client actions"
```

---

### Task 3: Portal tickets list, create dialog, thread + reply

**Files:**
- Modify: `app/(client)/portal/layout.tsx` (NAV `Tickets` → `enabled: true`)
- Create: `app/(client)/portal/tickets/page.tsx`
- Create: `app/(client)/portal/tickets/[id]/page.tsx`
- Create: `components/portal/new-ticket-button.tsx`
- Create: `components/portal/reply-form.tsx`

**Interfaces:**
- Consumes: `getCurrentSession()`, `listOwnTickets`, `getOwnTicketThread`, `PortalTicketRow`/`ThreadMessage`/`TicketStatus`, `createTicketAction`/`clientReplyAction`, `PortalActionState`.
- Pages are server components with `export const dynamic = 'force-dynamic'`; both fetch the session themselves and treat `null` as unreachable (layout guarantees; `redirect('/login')` defensively).

**Behavior contracts:**
- List page: heading "Tickets" + `<NewTicketButton />` in header row; table `#TKT-<number>` (mono) / Subject (link to thread) / Status badge / Last activity (UTC `toISOString().slice(0,16).replace('T',' ')`); empty state "No tickets yet — create your first one."; status badge map inline (same four statuses as admin inbox; colors may mirror admin's).
- Thread page: `params: Promise<{ id: string }>` awaited; `getOwnTicketThread(session.userId, id)` → `notFound()` on `!ok`; header `#TKT-<number>` + subject + status badge; messages chronological — client-authored bubbles labeled **"You"**, admin-authored labeled by `author_name ?? 'Support'`; `<time dateTime>` UTC stamps; `whitespace-pre-wrap` bodies; when `ticket.status === 'closed'` render muted note above reply form: "This ticket is closed — replying will reopen it."; `<ReplyForm ticketId />` below.
- `NewTicketButton`: Dialog with Subject (`Input`, name=`subject`, maxLength 200, required) + Message (`Textarea`, name=`body`, maxLength 10000, required); `useTransition` direct-call of `createTicketAction` (imported from `@/lib/crm/client-actions` — note: this action's success path `redirect()`s, so the transition resolves by navigation; no refresh needed); error rendered inside dialog; pending labels.
- `ReplyForm`: textarea (name=`body`, maxLength 10000, required) + submit; `useTransition` direct-call of `clientReplyAction(ticketId, {}, formData)`; on success `formRef.current?.reset()`; on error inline error retained (early return before reset — mirror `components/admin/reply-form.tsx`).

- [ ] **Step 1: Build the five files** per contracts above (markup precedents: `app/(admin)/admin/tickets/*`, `components/admin/reply-form.tsx`, `components/admin/client-actions.tsx`).
- [ ] **Step 2: Gates** — `npm run lint && npx tsc --noEmit && npm run build` green.
- [ ] **Step 3: Probes (temp fixtures, all deleted after)**

Create TEMP admin + TEMP client A + TEMP client B (bootstrap script; passwords uncommitted). Sign in as client A (playwright-core recipe in P3b task-4 report):
1. `/portal/tickets` empty state → New ticket dialog: empty-subject error, then valid create → **lands on new thread** with "You" bubble; ticket appears in list and in ADMIN inbox (cross-check in second browser context as admin).
2. Admin replies from admin thread view → client thread shows admin's name + message.
3. Client replies → appears; admin inbox shows ticket `open` again after admin had set `awaiting_client` (trigger evidence).
4. Admin sets `closed` → client thread shows closed badge + reopen note → client replies → status flips to `open` (reopen-on-reply evidence).
5. Isolation: client B's token via curl `GET /rest/v1/tickets` → only B's rows; `GET /rest/v1/ticket_messages?ticket_id=eq.<A-ticket>` → `[]`. Direct URL `/portal/tickets/<A-ticket-id>` as B → not-found page.
6. Spam cap: create 10 tickets via service REST as fixture, 11th via UI dialog → cap error message.
7. Cleanup: delete ALL tickets/messages created (service REST), delete temp users (auth + cascade check).

- [ ] **Step 4: Commit**

```bash
git add "app/(client)/portal/layout.tsx" "app/(client)/portal/tickets" components/portal
git commit -m "feat(portal): add client ticket list, creation and threaded replies"
```

---

### Task 4: Dashboard upgrade + docs close-out

**Files:**
- Modify: `app/(client)/portal/page.tsx` (full replace)
- Modify: `docs/crm/README.md`

**Interfaces:**
- Consumes: `countOwnOpenTickets`, `listOwnTickets(clientId, 4)`.
- Dashboard: "Open tickets" card = real own count; new "Recent tickets" section (last 4, same row markup as list page, linking to threads; empty state "No tickets yet."); "Active projects" card stays `0` / 'Projects arrive in P4a'; "Outstanding invoice" stays `—` / 'Invoicing arrives in P4b'.

- [ ] **Step 1: Replace `app/(client)/portal/page.tsx`**

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentSession } from '@/lib/auth/session';
import { countOwnOpenTickets, listOwnTickets } from '@/lib/crm/tickets';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  answered: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  awaiting_client: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  closed: 'bg-muted text-muted-foreground',
};

export default async function PortalDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal');

  const [openTickets, recent] = await Promise.all([
    countOwnOpenTickets(session.userId),
    listOwnTickets(session.userId, 4),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Open tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{openTickets}</p>
            <p className="mt-1 text-xs text-muted-foreground">Awaiting a reply from support</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Active projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">0</p>
            <p className="mt-1 text-xs text-muted-foreground">Projects arrive in P4a</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">—</p>
            <p className="mt-1 text-xs text-muted-foreground">Invoicing arrives in P4b</p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent tickets</h2>
          <Link href="/portal/tickets" className="text-sm underline-offset-4 hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tickets yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">TKT-{t.number}</td>
                    <td className="px-4 py-2">
                      <Link href={`/portal/tickets/${t.id}`} className="underline-offset-4 hover:underline">
                        {t.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[t.status] ?? ''}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Update `docs/crm/README.md`** — add "Client portal flows" section (create → redirect-to-thread; reply; reopen-on-reply note; ownership enforcement layers: action check + RLS + ownership-scoped queries; 24h/10-ticket cap); append probe rows from Task 3 to the matrix; update non-goals (P3c done — remove from list; attachments P4a, invoices P4b, notifications P5 remain).

- [ ] **Step 3: Final gates + close-out**

```bash
npm run lint && npx tsc --noEmit && npm run build
git diff main --stat
```

Secret spot-grep (`sb_`, passwords, console.logs) on the branch diff; summarize for user; merge only on explicit confirmation.

- [ ] **Step 4: Commit**

```bash
git add "app/(client)/portal/page.tsx" docs/crm/README.md
git commit -m "feat(portal): show real ticket stats on dashboard and document client flows"
```

---

## Spec coverage map (for reviewer)

| Spec item (§8 P3c + §5 portal scope) | Task |
|---|---|
| Ticket create (client) | Tasks 2 (module+action), 3 (UI+probes) |
| Ticket list (own, newest-first) | Tasks 2, 3 |
| Threaded view + reply | Tasks 2, 3 |
| Reopen-on-reply semantics (approved ruling) | Tasks 2 (module), 3 (probe 4), 3 (closed note) |
| Dashboard: ticket statuses real; projects/invoices placeholders | Task 4 |
| P3b hardening carry-over (subject cap, insert guard) | Task 1 |
| Defense-in-depth: requireClient is_active + ownership-scoped queries + RLS | Task 2 (+ probe 5) |
| Docs under docs/crm + verification loop | Task 4 |
