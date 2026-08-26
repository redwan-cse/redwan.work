# Phase 4a — Projects & Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin Projects view (CRUD, milestones, deliverable uploads, archive-then-purge deletion) and client Files browser (per-project deliverables with presigned downloads), plus portal ticket attachments closing the spec §5 gap, with the dashboard's Active-projects card going real.

**Architecture:** Three new tables (`projects`, `milestones`, `files`) with RLS where clients read own-scope and all mutations run through service-role server actions gated by the established `requireAdmin`/`requireClient` checks. Deliverables and ticket attachments reuse the P2 presign→direct-PUT pattern with spec §4 key schemes (`private/{clientUserId}/project_{id}/…`, pending keys `private/{uid}/pending/…` until a ticket exists). Deletion is archive-then-purge: ZIP (project + milestones + file objects, ≤100 MB cap) stored at `archive/…` in the private bucket, `archived_at` set, dashboard banner nags with authenticated 60-second presigned downloads, and the daily cron hard-deletes after 30 days.

**Tech Stack:** Next.js 16 + existing action patterns · `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` + NEW `@aws-sdk/lib-storage` (streamed archive upload) + NEW `archiver` (ZIP) · Postgres enums + RLS · shadcn/ui. No other new deps.

**Spec:** `docs/superpowers/specs/2026-08-24-client-crm-design.md` (§3 projects/milestones/files + RLS summary, §4 deliverable storage + delete semantics, §5 admin Projects + client Files/Tickets, §8 P4a). Rulings approved 2026-08-25: portal ticket attachments INCLUDED (§5 gap); deletion = archive-ZIP → 30-day dashboard download window → automatic hard purge (email skipped; dashboard banner instead; restore is manual from local backups, runbook only); `files.invoice_id` deferred to P4b; deliverable count uncapped at launch (spec §4).

## Global Constraints

- Gate per task: `npm run lint && npx tsc --noEmit && npm run build` all green.
- One branch: `feat/projects-files`. Commits per task. No push/merge to main without explicit user confirmation.
- Env names locked; `.env.example` unchanged this phase (no new vars); secrets never printed/logged/committed.
- Never log PII (names/emails/bodies/filenames in reports beyond 'probe' placeholders).
- Untouched: `app/api/contact/**`, `lib/contact/**`, `lib/blogger.ts`, `(auth)` pages, `proxy.ts`, logout route, admin Tickets/Clients/Overview pages except where a task explicitly says (dashboard banner in T3).
- SQL LSP false positives on migrations — trust `npx supabase db push`.
- Dev server: `pkill -f '[n]ext dev'`; probes localhost only; test-secret Turnstile pair for E2E (`TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` env override on the dev process).
- Zero persistent fixtures: probe projects/files/users deleted before DONE (archive-flow probe deletes its R2 objects too).
- Success-handling in client components: `useTransition` direct-call pattern; form-ref `reset()` on success only.
- Ownership checks happen in server modules (not just RLS): every client-facing query/mutation takes the viewer id and filters/verifies.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0006_projects_files.sql` | enums + `projects`/`milestones`/`files` + indexes + RLS |
| `lib/r2.ts` (modify) | portal presign/GET/bytes/put helpers + key makers |
| `lib/crm/projects.ts` | admin + client project/milestone/archive service functions |
| `lib/crm/files.ts` | file rows: create/ownership-download/delete/ticket-attachment queries |
| `lib/crm/admin-actions.ts` (modify) | project/milestone/deliverable/archive actions |
| `lib/crm/client-actions.ts` (modify) | ticket-attachment presign/confirm actions |
| `app/api/files/[id]/download/route.ts` | GET: session → ownership → 302 presigned 60s |
| `app/(admin)/admin/layout.tsx` (modify) | NAV Projects enabled |
| `app/(admin)/admin/page.tsx` (modify) | archived-projects banner |
| `app/(admin)/admin/projects/page.tsx` | list + archived section |
| `app/(admin)/admin/projects/[id]/page.tsx` | detail: edit, milestones, deliverables, archive |
| `components/admin/project-forms.tsx` | create/edit/milestone/deliverable/archive client components |
| `app/(client)/portal/layout.tsx` (modify) | NAV Files enabled |
| `app/(client)/portal/page.tsx` (modify) | real Active-projects count |
| `app/(client)/portal/files/page.tsx` | deliverables grouped per project |
| `components/portal/ticket-attachments.tsx` | attach UI for new-ticket dialog + reply form |
| `app/api/uploads/ticket-presign/route.ts` | client-gated attachment presign |
| `app/api/cron/r2-retention/route.ts` (modify) | + archive purge, project purge, pending cleanup |
| `docs/crm/README.md`, `docs/r2/README.md` (modify) | close-out docs |

---

### Task 1: Migration 0006 + lib/r2 portal additions + deps

**Files:**
- Create: `supabase/migrations/0006_projects_files.sql`
- Modify: `lib/r2.ts` (append)
- Install: `archiver`, `@aws-sdk/lib-storage`, `@types/archiver` (dev)

**Interfaces:**
- Produces (migration): enums `project_status(active,pause,done)`→ EXACT `('active','paused','done')`, `milestone_status('pending','in_progress','done')`, `file_kind('attachment','deliverable','asset')`, `file_bucket('public','private')`; tables per spec §3 with the archive columns on projects; integrity CHECKs (attachment⇒ticket_id, deliverable⇒project_id); RLS select-own-scope policies; NO client mutation policies (service-role only).
- Produces (`lib/r2.ts` additions):
  - `export function makeDeliverableKey(clientUserId: string, projectId: string, ext: string): string` → `private/{clientUserId}/project_{projectId}/{uuid}.{ext}`
  - `export function makePendingAttachmentKey(clientUserId: string, ext: string): string` → `private/{clientUserId}/pending/{uuid}.{ext}`
  - `export function makeTicketAttachmentKey(clientUserId: string, ticketId: string, ext: string): string`
  - `export function isPortalKey(key: string): boolean` → `^private/[0-9a-f-]{36}/`
  - `export async function presignPrivatePut(key: string, mime: string, expiresIn = 600): Promise<string>`
  - `export async function presignPrivateGet(key: string, expiresIn = 60): Promise<string>`
  - `export async function getPrivateObjectBytes(key: string): Promise<Buffer>`
  - `export async function putPrivateObject(key: string, body: Buffer, contentType: string): Promise<void>` — uses `@aws-sdk/lib-storage` Upload
  - `export const ARCHIVE_MAX_BYTES = 100 * 1024 * 1024; export const ARCHIVE_PREFIX = 'archive/'; export const PENDING_PREFIX = 'pending/';`

- [ ] **Step 1: Install deps**

Run: `npm install archiver @aws-sdk/lib-storage && npm install -D @types/archiver`

- [ ] **Step 2: Write migration**

```sql
-- 0006_projects_files.sql
create type project_status as enum ('active', 'paused', 'done');
create type milestone_status as enum ('pending', 'in_progress', 'done');
create type file_kind as enum ('attachment', 'deliverable', 'asset');
create type file_bucket as enum ('public', 'private');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text,
  status project_status not null default 'active',
  started_at timestamptz not null default now(),
  due_at date,
  archived_at timestamptz,
  archive_key text,
  created_at timestamptz not null default now()
);

create index projects_client_idx on public.projects (client_id);
create index projects_archived_idx on public.projects (archived_at);

alter table public.projects enable row level security;

create policy "projects_select_own_or_admin"
  on public.projects for select
  using (client_id = auth.uid() or public.is_admin());

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  amount_cents int not null default 0 check (amount_cents >= 0),
  currency char(3) not null default 'USD',
  position int not null default 0,
  status milestone_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index milestones_project_idx on public.milestones (project_id, position);

alter table public.milestones enable row level security;

create policy "milestones_select_via_project"
  on public.milestones for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.client_id = auth.uid() or public.is_admin())
    )
  );

create table public.files (
  id uuid primary key default gen_random_uuid(),
  bucket file_bucket not null,
  r2_key text not null unique,
  kind file_kind not null,
  ticket_id uuid references public.tickets (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  filename text not null check (char_length(filename) between 1 and 255),
  mime text not null check (char_length(mime) between 1 and 128),
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  check (kind <> 'attachment' or ticket_id is not null),
  check (kind <> 'deliverable' or project_id is not null)
);

create index files_ticket_idx on public.files (ticket_id);
create index files_project_idx on public.files (project_id);
create index files_kind_idx on public.files (kind);

alter table public.files enable row level security;

create policy "files_select_own_scope"
  on public.files for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.client_id = auth.uid()
    )
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.client_id = auth.uid()
    )
  );
```

Run: `npx supabase db push`; `npx supabase migration list` → 0006 both sides.

- [ ] **Step 3: Append to `lib/r2.ts`**

```typescript
export const ARCHIVE_MAX_BYTES = 100 * 1024 * 1024;
export const ARCHIVE_PREFIX = 'archive/';
export const PENDING_PREFIX = 'pending/';

export function makeDeliverableKey(clientUserId: string, projectId: string, ext: string): string {
  return `private/${clientUserId}/project_${projectId}/${randomUUID()}.${ext}`;
}

export function makePendingAttachmentKey(clientUserId: string, ext: string): string {
  return `private/${clientUserId}/pending/${randomUUID()}.${ext}`;
}

export function makeTicketAttachmentKey(clientUserId: string, ticketId: string, ext: string): string {
  return `private/${clientUserId}/ticket_${ticketId}/${randomUUID()}.${ext}`;
}

export function isPortalKey(key: string): boolean {
  return key.startsWith('private/');
}

export async function presignPrivatePut(key: string, mime: string, expiresIn = 600): Promise<string> {
  const client = privateClient();
  const cmd = new PutObjectCommand({
    Bucket: process.env.R2_PRIVATE_BUCKET,
    Key: key,
    ContentType: mime,
  });
  return getSignedUrl(client, cmd, { expiresIn });
}

export async function presignPrivateGet(key: string, expiresIn = 60): Promise<string> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = privateClient();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: key }), {
    expiresIn,
  });
}

export async function getPrivateObjectBytes(key: string): Promise<Buffer> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = privateClient();
  const res = await client.send(
    new GetObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: key })
  );
  const bytes = await res.Body?.transformToByteArray();
  return Buffer.from(bytes ?? []);
}

export async function putPrivateObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const { Upload } = await import('@aws-sdk/lib-storage');
  const client = privateClient();
  const upload = new Upload({
    client,
    params: {
      Bucket: process.env.R2_PRIVATE_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    },
  });
  await upload.done();
}
```

- [ ] **Step 4: Gates** — `npm run lint && npx tsc --noEmit && npm run build` green.
- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json supabase/migrations/0006_projects_files.sql lib/r2.ts
git commit -m "feat(files): add projects, milestones and files schema with r2 portal helpers"
```

---

### Task 2: Server modules — projects, files, actions

**Files:**
- Create: `lib/crm/projects.ts`
- Create: `lib/crm/files.ts`
- Modify: `lib/crm/admin-actions.ts` (append)
- Modify: `lib/crm/client-actions.ts` (append)

**Interfaces:**
- Consumes: `getSupabaseAdmin`, `crmError`/`CrmResult`, `getCurrentSession`, lib/r2 Task-1 helpers, `validateContactFile`/`CONTACT_MAX_SIZE_BYTES`/`CONTACT_ALLOWED_EXT` (same rules for portal files), existing `requireAdmin`/`requireClient` patterns (READ admin-actions.ts + client-actions.ts first).
- Produces (`lib/crm/projects.ts`):
  - `export type ProjectStatus = 'active' | 'paused' | 'done';`
  - `export interface ProjectRow { id: string; client_id: string; client_name: string | null; client_email: string; name: string; description: string | null; status: ProjectStatus; started_at: string; due_at: string | null; archived_at: string | null; archive_key: string | null; milestone_total: number; milestone_done: number; file_count: number; }`
  - `export interface MilestoneRow { id: string; project_id: string; title: string; amount_cents: number; currency: string; position: number; status: 'pending' | 'in_progress' | 'done'; }`
  - `listProjects(opts: { archived?: boolean }): Promise<ProjectRow[]>` — admin; client join via profiles + email via `getUserById`; milestone/file counts via separate aggregate selects (two `head:false` count queries grouped in JS — simple loop acceptable at this scale).
  - `getProjectDetail(projectId: string): Promise<{ ok: true; project: ProjectRow; milestones: MilestoneRow[]; files: FileRow[] } | { ok: false; error: string }>` — files = kind `deliverable` for the project.
  - `createProject(input: { client_id: string; name: string; description?: string; due_at?: string }): Promise<{ ok: true; projectId: string } | { ok: false; error: string }>` — validates name 1..200 trimmed; client_id must be an active client profile (`role='client' and is_active`); due_at optional `YYYY-MM-DD`.
  - `updateProject(projectId: string, patch: { name?: string; description?: string | null; status?: ProjectStatus; due_at?: string | null }): Promise<CrmResult>`
  - `addMilestone(projectId: string, input: { title: string; amount_cents?: number; currency?: string }): Promise<CrmResult>` — position = max+1.
  - `updateMilestone(milestoneId: string, patch: { title?: string; amount_cents?: number; status?: 'pending'|'in_progress'|'done' }): Promise<CrmResult>`
  - `deleteMilestone(milestoneId: string): Promise<CrmResult>`
  - `moveMilestone(milestoneId: string, direction: 'up' | 'down'): Promise<CrmResult>` — swaps position with neighbor.
  - `archiveProject(projectId: string): Promise<{ ok: true; archiveKey: string } | { ok: false; error: string }>` — refuses if already archived; sums deliverable `size_bytes` > `ARCHIVE_MAX_BYTES` → error `'Project files exceed the 100 MB archive limit. Download large files manually first.'`; builds ZIP via `archiver` (project.json metadata + milestones.json + each file object under `files/{filename}` — dedupe names with `-2` suffixes) using `getPrivateObjectBytes`; `putPrivateObject(archive/project_{id}/{ISO-timestamp}.zip)`; updates row `archived_at=now(), archive_key`.
  - `purgeArchivedProject(projectId: string): Promise<CrmResult>` — requires `archived_at` set; collects deliverable r2_keys + archive_key → `deletePrivateObjects` → delete row (cascades).
  - `listArchivedProjects(): Promise<Array<Pick<ProjectRow,'id'|'name'|'client_name'|'archived_at'>>>`
  - `getArchiveDownloadUrl(projectId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>` — requires archived; `presignPrivateGet(archive_key, 60)`.
  - `listOwnProjects(clientId: string): Promise<PortalProjectRow[]>` — `archived_at IS NULL`, newest first: `{ id, name, status, due_at, milestone_total, milestone_done }`.
  - `countOwnActiveProjects(clientId: string): Promise<number>` — status `'active'`, not archived.
- Produces (`lib/crm/files.ts`):
  - `export interface FileRow { id: string; bucket: 'public' | 'private'; r2_key: string; kind: 'attachment' | 'deliverable' | 'asset'; ticket_id: string | null; project_id: string | null; filename: string; mime: string; size_bytes: number; created_at: string; uploaded_by: string; }`
  - `createFileRow(input: { bucket: 'private'; r2_key: string; kind: 'attachment' | 'deliverable'; ticket_id?: string; project_id?: string; uploaded_by: string; filename: string; mime: string; size_bytes: number }): Promise<CrmResult>` — validates key via `isValidContactKey` OR `isPortalKey`; enforces kind/scope integrity mirroring the DB CHECKs.
  - `getOwnedFileUrl(fileId: string, viewer: { userId: string; role: 'admin' | 'client' }): Promise<{ ok: true; url: string; filename: string } | { ok: false; error: string }>` — loads row; admin passes; client passes only if deliverable's project is theirs or attachment's ticket is theirs (joins); `presignPrivateGet(r2_key, 60)`.
  - `deleteOwnedFile(fileId: string, viewer): Promise<CrmResult>` — admin: S3 delete + row delete; client: only own-scope attachment AND `created_at` within 24h (grace window), else refuse.
  - `listTicketAttachmentRows(ticketId: string): Promise<FileRow[]>` — kind attachment for the ticket (thread display).
  - `listOwnDeliverables(clientId: string): Promise<Array<FileRow & { project_name: string }>>` — join projects where client_id, `archived_at IS NULL`, order project name then created_at.
  - `countPendingAttachmentOrphans(): Promise<{ rows: number; keys: string[] }>` — kind attachment, ticket_id null, created_at < 24h ago (cron helper).
- Produces (admin-actions.ts additions — every one starts with `requireAdmin()`):
  - `createProjectAction(_prev: CrmActionState, formData: FormData)` — fields `client_id`, `name`, `description`, `due_at`; revalidate `/admin/projects` + `/admin`; success notice `'Project created.'`
  - `updateProjectAction(projectId: string, _prev: CrmActionState, formData: FormData)` — fields name/description/status/due_at; revalidate detail + list.
  - `addMilestoneAction(projectId: string, _prev, formData)` — title/amount/currency; revalidate detail.
  - `updateMilestoneAction(milestoneId: string, patch-json string via formData field 'patch')` — OR simpler: `setMilestoneStatusAction(milestoneId, status)` + `deleteMilestoneAction(milestoneId)` + `moveMilestoneAction(milestoneId, direction)`; revalidate detail.
  - `getDeliverablePresignAction(projectId: string, filename: string, mime: string, size: number): Promise<{ ok: true; key: string; uploadUrl: string } | { ok: false; error: string }>` — requireAdmin; resolves project → client_id; `makeDeliverableKey`; `presignPrivatePut`.
  - `confirmDeliverableAction(projectId: string, meta: { key; filename; mime; size_bytes }): Promise<CrmActionState>` — requireAdmin; `createFileRow(kind deliverable)`; revalidate detail.
  - `deleteFileAction(fileId: string): Promise<CrmActionState>` — requireAdmin; revalidate detail/list.
  - `archiveProjectAction(projectId: string): Promise<CrmActionState>` — notice `'Project archived. Download the backup from the Projects list within 30 days.'`; revalidate list + `/admin`.
  - `purgeArchivedProjectAction(projectId: string): Promise<CrmActionState>` — revalidate list + `/admin`.
  - `archiveDownloadUrlAction(projectId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>` — requireAdmin (used by download button fetch).
- Produces (client-actions.ts additions — `requireClient()`):
  - `getTicketAttachmentPresignAction(input: { ticketId: string | null; filename: string; mime: string; size: number }): Promise<{ ok: true; key: string; uploadUrl: string } | { ok: false; error: string }>` — validates via `validateContactFile`; cap: ≤10 attachment rows per ticket (when ticketId set) else error `'A ticket can have at most 10 attachments.'`; pending key when ticketId null.
  - `confirmTicketAttachmentAction(input: { ticketId: string | null; entries: Array<{ key; filename; mime; size_bytes }> }): Promise<CrmActionState>` — requireClient; `createFileRow` per entry (ticketId null → pending rows with ticket_id null); revalidate thread/list when ticketId set.

- [ ] **Step 1: Write `lib/crm/projects.ts`** per interfaces (ZIP: `import archiver from 'archiver'`; build into a Buffer via collecting chunks; metadata files `project.json`/`milestones.json` via `archive.append(JSON.stringify(...), { name })`; file objects via `archive.append(buffer, { name: deduped })`; finalize → concat).
- [ ] **Step 2: Write `lib/crm/files.ts`** per interfaces.
- [ ] **Step 3: Append actions** to both action files per interfaces.
- [ ] **Step 4: Gates** — `npm run lint && npx tsc --noEmit && npm run build` green.
- [ ] **Step 5: Commit**

```bash
git add lib/crm/projects.ts lib/crm/files.ts lib/crm/admin-actions.ts lib/crm/client-actions.ts
git commit -m "feat(files): add project, milestone and file service modules with actions"
```

---

### Task 3: Admin Projects views + dashboard banner

**Files:**
- Modify: `app/(admin)/admin/layout.tsx` (NAV Projects enabled)
- Modify: `app/(admin)/admin/page.tsx` (archived banner)
- Create: `app/(admin)/admin/projects/page.tsx`
- Create: `app/(admin)/admin/projects/[id]/page.tsx`
- Create: `components/admin/project-forms.tsx`

**Behavior contracts (normative; precedents: admin clients/tickets pages, convert-lead-button dialog pattern):**
- List page: force-dynamic; Active table (Name link / Client / Status badge active=blue paused=amber done=emerald / Due / Milestones `done/total` / Files count); archived rows NOT in main table — a collapsed "Archived" section below: name, client, archived date, "deletes <archived+30d date>" muted, Download backup button (fetches `archiveDownloadUrlAction` → `window.location.assign(url)`), Delete forever button (typed-confirm dialog calling `purgeArchivedProjectAction`); header "New project" button → dialog (client select from `listClients()` active only, name, description, due date input type=date) via `createProjectAction`.
- Detail page: `getProjectDetail` → notFound on !ok; header name + status badge + client line; Edit form (inline card: name/description/status select/due date) via `updateProjectAction(projectId, {}, formData)`; Milestones card: list ordered by position with status select (pending/in_progress/done), amount display `$x.xx` from cents, up/down arrows (`moveMilestoneAction`), delete; add form (title, amount dollars→cents integer, currency default USD) via `addMilestoneAction`; Deliverables card: upload control (file input → for each file: `getDeliverablePresignAction` → PUT → `confirmDeliverableAction`; same ext/size rules; progress/error surfacing like contact form), file rows with Download (`getOwnedFileUrl`-style via a small fetch to the download route — admins pass) and Delete (`deleteFileAction` typed-confirm); Danger zone card (only when not archived): "Archive project" typed-confirm → `archiveProjectAction` → router.push('/admin/projects'); archived projects show Download backup + Delete forever instead.
- Dashboard banner (page.tsx): if `listArchivedProjects().length > 0` render an amber banner above the stat cards: "N archived project(s) awaiting deletion — download backups from Projects." linking to `/admin/projects`.

- [ ] **Step 1: Build the five files** per contracts.
- [ ] **Step 2: Gates** green.
- [ ] **Step 3: Probes (temp fixtures, all deleted after)**

Temp admin + temp client A (bootstrap). As admin: create project for A (dialog) → detail renders; edit name/status/due; add 3 milestones, set one done, reorder, delete one; upload 2 deliverables (small PDFs) via UI → rows + objects exist (REST verify files table; listPrivateContactObjects-style check via one-off node eval on `private/` prefix); download a deliverable → 200 bytes match; delete one deliverable → row+object gone. Archive flow: archive project → banner appears on dashboard → projects list Archived section shows it with download → download backup → unzip (tmp) → contains project.json, milestones.json, both remaining files with correct bytes → purge (typed confirm) → rows cascade-gone, S3 objects gone (incl. archive zip). Cross-check: client A token REST `GET /rest/v1/projects` → only own; `GET /rest/v1/files` → only own-scope; foreign project id 404s in detail page as client B (second temp client owning nothing). Cleanup ALL fixtures.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/admin/layout.tsx" "app/(admin)/admin/page.tsx" "app/(admin)/admin/projects" components/admin/project-forms.tsx
git commit -m "feat(files): add admin projects view with milestones, deliverables and archive flow"

---

### Task 4: Client Files browser + downloads + dashboard count

**Files:**
- Modify: `app/(client)/portal/layout.tsx` (NAV Files enabled)
- Modify: `app/(client)/portal/page.tsx` (real Active projects count + projects mini-list)
- Create: `app/(client)/portal/files/page.tsx`
- Create: `app/api/files/[id]/download/route.ts`

**Behavior contracts (normative):**
- Download route: GET; `getCurrentSession()` → 401 JSON when null; `getOwnedFileUrl(id, {userId, role})` → 404-style JSON on !ok (no existence leak); success → `302` `Location: url` (60s presigned GET; browser downloads `filename` via R2 content-disposition? presigned GET lacks it — acceptable: browser uses key basename; note in docs).
- Files page: force-dynamic; groups `listOwnDeliverables` by project (project name heading + status badge + due date; file rows: filename, human size, uploaded date, Download button = plain `<a href="/api/files/{id}/download">` — navigation follows the 302); empty state "No deliverables yet."; projects with zero deliverables still listed (with "No files yet." muted line) so clients see project existence.
- Dashboard: "Active projects" card = `countOwnActiveProjects`; replace Recent-tickets section header row with TWO mini-lists? NO — keep Recent tickets as-is; ADD a "Projects" mini-list above it (name + status badge, linking to `/portal/files`), only when count > 0.

- [ ] **Step 1: Build the four files** per contracts.
- [ ] **Step 2: Gates** green.
- [ ] **Step 3: Probes**

Reuse Task 3 fixtures BEFORE cleanup (coordinate: run this task's probes with its own temp fixtures — temp admin + client A + one project + 2 deliverables): client A signs in → Files page groups correctly → download link returns file bytes (fetch follow-redirect) → dashboard Active count correct → Projects mini-list renders. Client B (no projects) → empty state; direct download of A's file id as B → 404-style JSON. Unauthenticated download → 401. Cleanup all fixtures + objects.

- [ ] **Step 4: Commit**

```bash
git add "app/(client)/portal/layout.tsx" "app/(client)/portal/page.tsx" "app/(client)/portal/files" "app/api/files"
git commit -m "feat(files): add client deliverables browser with presigned downloads"
```

---

### Task 5: Portal ticket attachments

**Files:**
- Create: `app/api/uploads/ticket-presign/route.ts`
- Modify: `components/portal/new-ticket-button.tsx` (attach support)
- Modify: `components/portal/reply-form.tsx` (attach support)
- Modify: `app/(client)/portal/tickets/[id]/page.tsx` (attachment display)
- Modify: `app/(admin)/admin/tickets/[id]/page.tsx` (attachment display)

**Behavior contracts (normative):**
- `POST /api/uploads/ticket-presign`: session client (cookie-bound `getCurrentSession()` + fresh is_active via service read — mirror client-actions requireClient logic; route-handler context) else 401; body `{ ticketId: string | null, files: [{filename, mime, size}] }` 1..N; per-file `validateContactFile` + mime cross-check map (mirror presign route); cap ≤10 attachment rows for the ticket (query files table) → 400 `'A ticket can have at most 10 attachments.'`; ticketId set → verify ticket ownership (client_id = session.userId) else 404-style; keys: `makeTicketAttachmentKey` when ticketId, else `makePendingAttachmentKey`; respond `{ uploads: [{ key, uploadUrl, filename }] }`. NO Turnstile (authenticated surface; rate-limit via a light in-memory per-session counter — max 3 presign calls/min/session, 429 otherwise).
- New-ticket dialog: optional attach control (same UI pattern as contact form's, compact); uploads go to pending keys on selection; on successful `createTicketAction` (which redirects), attachments must already be confirmed — ORDER: dialog collects metas; on submit: FIRST `createTicketAction` — but it redirects immediately... RESOLUTION (binding): change the dialog submit to call a NEW wrapper `createTicketWithAttachmentsAction(subject, body, entries)` added to client-actions (requireClient; `createTicket` then `confirmTicketAttachmentAction`-equivalent inline: createFileRow per entry with the new ticketId; revalidate) — dialog calls this instead of `createTicketAction`; redirect to thread happens after rows are created. `createTicketAction` stays for backward compat (unused) or is removed — REMOVE it and migrate (grep confirms only the dialog used it).
- Reply form: attach control; on submit BEFORE `clientReplyAction`: for each pending file call `confirmTicketAttachmentAction({ticketId, entries})` (keys already ticket-scoped from presign with ticketId) — order: upload on selection (ticket-scoped keys), confirm rows on successful reply (after reply succeeds; if reply fails keep metas for retry); pass metas into the reply action? SIMPLER BINDING: reply form uploads on selection with ticket-scoped keys and calls `confirmTicketAttachmentAction` immediately after each successful PUT (rows exist before the reply message; harmless), reply proceeds independently. Choose this simpler order for replies; the new-ticket flow uses the wrapper above.
- Thread pages (client + admin): after messages, an "Attachments" section listing `listTicketAttachmentRows(ticketId)` (client page passes ownership via session; admin page passes admin) with filename + size + Download link to `/api/files/{id}/download`; hide section when none.
- Client delete-within-grace: NOT exposed in UI this phase (module supports it; runbook notes it).

- [ ] **Step 1: Build per contracts** (mirror contact-form attach UI patterns compactly; reuse `formatBytes`-style helper if present).
- [ ] **Step 2: Gates** green.
- [ ] **Step 3: Probes**

Temp admin + client A + client B (bootstrap). As A: create ticket with 2 attachments (different names) → thread shows Attachments section with both; download each → bytes match; admin thread view shows same attachments; admin downloads fine. Reply with 1 attachment → appears. B direct-URL to A's attachment download → 404 JSON; B token REST files → []. Cap: seed 10 attachment rows for a ticket via service, 11th upload attempt → exact cap error. Pending-orphan: upload via presign with ticketId null, never confirm → cron-style query `countPendingAttachmentOrphans` sees it (live probe via service REST on files table) → delete row + object manually. Cleanup ALL fixtures + objects + rows.

- [ ] **Step 4: Commit**

```bash
git add app/api/uploads/ticket-presign/route.ts components/portal "app/(client)/portal/tickets/[id]/page.tsx" "app/(admin)/admin/tickets/[id]/page.tsx" lib/crm/client-actions.ts
git commit -m "feat(files): add portal ticket attachments with presigned uploads"
```

---

### Task 6: Cron extension + docs close-out

**Files:**
- Modify: `app/api/cron/r2-retention/route.ts`
- Modify: `docs/crm/README.md`, `docs/r2/README.md`

**Behavior contracts (normative):**
- Cron route gains three stages AFTER the existing contact/ purge (each wrapped so one failure doesn't skip the rest; per-stage counts added to the JSON response):
  1. Archive purge: list `archive/` prefix objects >30 days old → delete.
  2. Project purge: `select id, archive_key from projects where archived_at < now() - 30 days` → for each: collect deliverable r2_keys (files table) + archive_key → `deletePrivateObjects` → delete project row (cascades milestones/files). Response field `projectsPurged`.
  3. Pending-attachment cleanup: `countPendingAttachmentOrphans()`-style rows (>24h, ticket_id null, kind attachment) → delete their objects + rows; PLUS list `pending/` prefix objects >24h old with no files row → delete objects. Response field `pendingCleaned`.
- Docs: `docs/crm/README.md` — Projects & files section (admin flows incl. archive→30-day→purge + restore-from-local-backup note; client files/downloads; ticket attachments incl. 10-cap and pending-orphan cleanup); probe matrix rows appended from Tasks 3-5 reports. `docs/r2/README.md` — key schemes table gains project_/ticket_/pending_/archive_ prefixes + archive retention note.

- [ ] **Step 1: Extend the cron route** per contracts.
- [ ] **Step 2: Update both docs** (probe matrix = ACTUAL results from task reports; no PII/full UUIDs).
- [ ] **Step 3: Gates + probes**

Gates green. Probes: live cron run with bearer → 200 with new per-stage counts, idempotent second run; synthetic archived project (service: set archived_at = now-31d on a temp project with 1 deliverable object) → cron purges it (rows + objects gone) → cleanup; synthetic pending orphan >24h (service insert backdated) → cron cleans row+object. Cleanup everything.

- [ ] **Step 4: Final gates + close-out**

```bash
npm run lint && npx tsc --noEmit && npm run build
git diff main --stat
```

Secret spot-grep; summarize; merge only on explicit confirmation.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/r2-retention/route.ts docs/crm/README.md docs/r2/README.md
git commit -m "feat(files): extend retention cron with archive, project purge and orphan cleanup"
```

---

## Spec coverage map (for reviewer)

| Spec item (§8 P4a + §3/§4/§5) | Task |
|---|---|
| projects/milestones/files schema + RLS summary | Task 1 |
| Admin Projects CRUD + milestones list | Tasks 2 (modules/actions), 3 (UI) |
| Deliverables upload (admin, spec §4 key scheme + limits) | Tasks 1 (helpers), 2 (actions), 3 (UI) |
| Per-project files & invoices → files list (invoices P4b) | Task 3 |
| Client Files browser per project + presigned downloads (60s) | Tasks 2, 4 |
| Client dashboard active projects real | Task 4 |
| §5 ticket "(+attachments)" gap (approved inclusion) | Tasks 2 (actions), 5 |
| Delete: archive ZIP → 30-day window → hard purge (approved ruling) | Tasks 2 (archive/purge), 3 (UI), 6 (cron) |
| Retention cron extension + pending-orphan hygiene | Task 6 |
| Docs under docs/crm + docs/r2 | Task 6 |
| invoice_id deferred to P4b | Task 1 (omitted column) |
