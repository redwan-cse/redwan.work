# R2 Object Storage — Contact Attachments & Portal Files

Architecture and runbook for the Cloudflare R2 storage behind the contact form's
file attachments (Phase 2) and the portal's deliverable / ticket-attachment files
(Phase 4a — see `docs/crm/README.md` for the CRM-side flows). The user-facing
copy lives in [`docs/contact/README.md`](../contact/README.md) and on `/privacy`.

## Architecture

Two buckets are used (both on one R2 endpoint, separate scoped API tokens):

| Bucket | Access | Used for |
|---|---|---|
| `R2_PRIVATE_BUCKET` | Private — reachable only via presigned URLs and server-side credentials | Contact attachment uploads (`contact/`) and portal files (`private/`, `archive/`) |
| `R2_PUBLIC_BUCKET` | Public-read via `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | Provisioned for future public assets; nothing written or read yet (deferred to P5) |

All private-bucket access goes through the server-only helpers in `lib/r2.ts`
(`import 'server-only'`); credentials never reach the browser. The browser only
ever sees short-lived presigned PUT URLs.

### Key scheme

Contact attachments use:

```
contact/<upload-folder-uuid>/<file-uuid>.<ext>
```

Both UUID segments are random v4 generated at presign time (`lib/r2.ts`), so
keys are unguessable and each upload batch gets its own folder. The full shape
is enforced by a strict regex (`isValidContactKey`) before any key from the
browser is accepted at submit time.

Portal files (P4a) add these private-bucket prefixes, enforced by `isPortalKey`:

| Prefix | Shape | Used for |
|---|---|---|
| `contact/` | `contact/<folder-uuid>/<file-uuid>.<ext>` | Contact-form attachments (90-day retention, retained flag) |
| `project_` | `private/<clientUserId>/project_<projectId>/<file-uuid>.<ext>` | Admin deliverable uploads |
| `ticket_` | `private/<clientUserId>/ticket_<ticketId>/<file-uuid>.<ext>` | Portal ticket attachments bound to a ticket |
| `pending/` | `private/<clientUserId>/pending/<file-uuid>.<ext>` | Not-yet-bound ticket attachments (orphans) |
| `archive/` | `archive/project_<projectId>/<ISO-timestamp>.zip` | Project archive ZIP backups (30-day retention) |

`isPortalKey` accepts any `private/<client-uuid>/...` key plus `archive/project_*.zip`.
`deletePrivateObjects` refuses anything that is neither a valid portal key nor a
valid contact-form key, so the retention cron can only delete real keys.

The archive prefix is not an object in the public/app data sense — it holds the
ZIP backup written when a project is archived (`archiveProject` in
`lib/crm/projects.ts`), with a **30-day retention**. Once a project's
`archived_at` passes 30 days the cron purges the archive object (and the
remaining deliverable objects) and deletes the project row.

### Limits

| Limit | Value | Enforced |
|---|---|---|
| Files per submission | 5 | presign route + lead parser + client pre-check |
| Size per file | 1 byte – 10 MB | presign route + lead parser + client pre-check |
| Extensions | pdf, docx, doc, xlsx, png, jpg, zip | all three layers |
| Mime ↔ extension cross-check | strict map per extension | presign route |
| Presign requests per IP | 20 / hour, fail-closed (DB-backed) | presign route |

### Turnstile re-execution flow (in words)

Every file-bearing submission consumes **two** independently verified,
single-use Turnstile tokens:

1. Form loads → managed Turnstile widget solves → token A.
2. User selects files → client requests `POST /api/uploads/presign` with token A.
   The route runs: same-origin check → R2-config gate → body/limit validation →
   mime↔ext cross-check → per-IP DB rate budget (fail-closed) → Cloudflare
   siteverify(token A) → replay guard (hashed token, single use per 5-minute
   window) → returns presigned PUT URLs (10-minute expiry).
3. Browser PUTs each file straight to R2 with its `Content-Type` header.
4. On submit, the form **resets the widget and waits for a fresh solve**
   (token B is never reused from step 1) before posting to `/api/contact`.
5. `/api/contact` verifies token B through siteverify + its own replay guard;
   the attachment metadata array (key/filename/mime/size) is validated
   key-by-key and stored in `leads.attachments` jsonb. Any client-supplied
   `retained` field is stripped — only admins can set it via SQL.

### Retention cron

`GET /api/cron/r2-retention` (registered in `vercel.json`, daily at 03:00 UTC):

1. Requires `Authorization: Bearer <CRON_SECRET>` — timing-safe compare
   (mirrors `/api/revalidate`). Wrong/missing secret → `401`.
2. R2 not configured → `503`.
3. **Stage 0 — contact purge:** loads the retained set: leads whose
   `attachments` contain an entry flagged `"retained": true` (jsonb containment
   `attachments @> '[{"retained":true}]'`). Lists all objects under `contact/`,
   computes stale keys with `staleObjectKeys(objects, cutoff, retained)` where
   `cutoff = now − 90 days` (strict `<`; retained keys always skipped),
   batch-deletes (1000/chunk).
4. **Stage 1 — archive purge:** lists `archive/`, deletes objects older than
   30 days.
5. **Stage 2 — project purge:** selects `projects` with
   `archived_at < now − 30 days`; for each, collects its deliverable `r2_key`s
   + `archive_key`, `deletePrivateObjects` them, then deletes the project row
   (cascades milestones/files).
6. **Stage 3 — pending cleanup:** deletes orphan rows (kind `attachment`,
   `ticket_id null`, `created_at > 24h` old) plus their objects, and deletes
   `pending/`-prefix objects older than 24h that have no `files` row.
7. Each stage is isolated — one failure is recorded and logged but does not
   skip the rest. Responds `200 {"deleted": n, "examined": m, "archivePurged":
   n1, "projectsPurged": n2, "pendingCleaned": n3, "errors": [...]}`.

## Runbook

### Owner prerequisite — bucket CORS (do this first)

The private bucket must have a CORS policy allowing browser uploads, otherwise
preflight fails and no attachment can be uploaded from the real site:

- Allowed origins: `https://redwan.work` and `http://localhost:3000`
- Allowed methods: `PUT`
- Allowed headers: `Content-Type`

**Note:** the app's R2 token is object-scoped and cannot read or write bucket
CORS settings (S3 CORS calls return `AccessDenied`). Set the policy in the
Cloudflare dashboard: R2 → *private bucket* → Settings → CORS policy.

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `R2_ENDPOINT` | Vercel + local `.env.local` | R2 S3-compatible endpoint |
| `R2_PRIVATE_BUCKET` | both | private attachment bucket name |
| `R2_PRIVATE_ACCESS_KEY_ID` / `R2_PRIVATE_SECRET_ACCESS_KEY` | both | object-scoped token for private bucket |
| `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | local only today | public bucket base URL (used at P5) |
| `CRON_SECRET` | both | bearer secret for the retention cron |

- **Pre-merge gate:** `R2_ENDPOINT` and `R2_PRIVATE_BUCKET` must be present in
  Vercel **Build** environment variables (not just runtime) BEFORE merging —
  the CSP header is generated at build time; missing build env silently blocks
  all browser uploads.

A `CRON_SECRET` was generated locally (`openssl rand -hex 32`) and appended to
`.env.local`. **At merge time, copy this exact same value into the Vercel
project's environment variables** so the deployed cron authenticates against
the same secret.

### Vercel Cron setup steps

1. Copy `CRON_SECRET` from `.env.local` into Vercel env vars (Production +
   Preview as desired). Value must match local exactly.
2. `vercel.json` already registers the schedule:
   `{ "crons": [{ "path": "/api/cron/r2-retention", "schedule": "0 3 * * *" }] }`.
   When `CRON_SECRET` exists as an env var, Vercel automatically sends
   `Authorization: Bearer $CRON_SECRET` on cron invocations.
3. Deploy (merge to `main`). Verify afterwards: Vercel dashboard → project →
   Cron Jobs shows the daily task; run logs appear under deployments/functions.

### Manual operations

Flag an attachment so the retention cron never deletes it (index = position in
the lead's `attachments` array):

```sql
update leads set attachments = jsonb_set(attachments, '{0,retained}', 'true')
where id = '<lead-uuid>';
```

Inspect a lead's attachment keys:

```sql
select attachments from leads where id = '<lead-uuid>';
```

Delete an object manually (Cloudflare dashboard → R2 → bucket, or):

```bash
npx wrangler r2 object delete "<private-bucket>/contact/<folder>/<file>.<ext>" --remote
```

## Probe matrix (actual results)

| # | Probe | Result |
|---|---|---|
| T2-a | Presign without Origin header | `403` request-origin-not-allowed ✅ |
| T2-b | Presign with empty `files` | `400` count message ✅ |
| T2-c | `.exe` filename | `400` type-not-allowed ✅ |
| T2-d | Fake token vs real Turnstile secret | `400` security-failed (siteverify rejected) ✅ |
| T2-e | pdf name + mismatched mime | `400` ext/mime mismatch ✅ |
| T2-f | E2E: presign → 10 KB PUT → object listed in R2 → deleted | all ✅ |
| T2-g | Replay of same token immediately | `400` token-already-used ✅ |
| T3-a | Browser attach 1 PDF → presign/PUT/submit | stored metadata matches bytes ✅ |
| T3-b | 2 files attached, 1 removed before submit | only kept file uploaded + submitted ✅ |
| T3-c | Duplicate-name batch (positional-matching fix) | each key bound to its own file's bytes (server-side sha256 verified) ✅ |
| T3-d | No-attachment submission | unchanged flow, `attachments: []` ✅ |
| T4-a | Cron without bearer / wrong bearer | `401` / `401` (timing-safe compare) ✅ |
| T4-b | Live cron run ×2 with real secret | `{"deleted":0,"examined":1}`, idempotent ✅ |
| T4-c | Independent R2 listing vs `examined` | both count 1 ✅ |
| T4-d | Real `staleObjectKeys` purity test | deletes-stale / skips-retained / strict cutoff boundary / deterministic / non-mutating / empty-set behavior — 6/6 ✅ |
| T4-e | Synthetic retained lead row via service REST | containment query matched exactly that row; live run skipped it (`deleted:0`, no errors); row deleted after ✅ |
| T5-a | Portal deliverable upload (admin) ×2 | 2 keys `private/{clientA}/project_{id}/{uuid}.pdf` present in R2 (`ListObjectsV2` count 2) ✅ |
| T5-b | Deliverable download | presigned GET (60s) returned exact bytes (42/43) ✅ |
| T5-c | Deliverable delete (admin) | `DeleteObjects` + row deleted; 1 key + 1 row remain ✅ |
| T5-d | Archive ZIP write | `putPrivateObject(archive/project_{id}/<ISO>.zip)` → 955-byte zip with project/milestones/file entries ✅ |
| T5-e | Archive backup download | presigned GET(60s) of `archive/project_*.zip` → unzip `-l` contains `project.json`, `milestones.json`, `files/deliverable-1.pdf`; extracted bytes match originals ✅ |
| T5-f | Purge (typed confirm path) | `DeleteObjects` `[deliverable key, archive key]` + `projects.delete` cascade → `projects`/`milestones`/`files` 0, private + archive prefixes 0 ✅ |
| T5-g | Deliverable R2 listing vs app | R2 `ListObjectsV2 private/{clientA}/project_{id}/` == 2 == `files` rows count ✅ |
| T6-a | Portal ticket presign (pending) | keys `private/{clientA}/pending/...pdf` + `.png` verified `includes('/pending/')`, PUT 200 each ✅ |
| T6-b | Reply presign (ticket-scoped) | key `private/{clientA}/ticket_{id}/*.zip` verified `includes('/ticket_')`, PUT 200 ✅ |
| T6-c | Attachment download as client + admin | 302 presigned R2 URL `https://private...r2.cloudflarestorage.com/...`; fetched bytes match originals (29B each) ✅ |
| T6-d | B direct download A's attachment | `404 {"error":"File not found."}` (no access, no leak) ✅ |
| T6-e | Pending orphan (R2 only) | presign `ticketId:null` + PUT → no `files` row (DB CHECK forbids `ticket_id null` attachment rows); `ListObjectsV2 private/{clientB}/pending/` contains orphan key; `DeleteObjects` removes it ✅ |

Positive-deletion path: deterministic via T4-d (pure function over real inputs);
first production purge observed after 90 days of live traffic is an owner
follow-up below. P4a archive/project purge deletions verified via T5-f (explicit
purge) and T6-e (pending orphan); the cron's own automated 30-day/24h sweeps are
verified in Task 6 probes (see `docs/crm/README.md`).

## Residual risks

- **Presigned PUT does not enforce content length.** The size limit is enforced
  client-side and on the declared metadata at submit, but a hostile client
  could PUT more/larger bytes than declared while the URL is valid (10 min).
  Exposure is capped by unguessable keys, the private bucket, and the retention
  sweep. Possible future hardening: object-lifecycle rules on the bucket or
  proxying uploads through the server.
- Upload contents are not scanned; only names/extensions/mimes are validated.
- Attachment bytes are deleted after 90 days but the metadata (filename, mime,
  size) persists in the lead record until the lead itself is deleted.

## Owner follow-ups

1. **Bucket CORS policy** (prerequisite above) before relying on real-browser uploads.
2. **Production E2E with real Turnstile** — headless probes ran against the
   official always-pass test sitekey; observe the first real submission end-to-end.
3. **First production purge**: after ~90 days of live attachments, confirm a cron
   run reports `deleted > 0` and spot-check the bucket.
4. **First automated archive/project purge**: once a real archived project exceeds
   its 30-day window, confirm a cron run reports `projectsPurged > 0` and the R2
   `archive/` / deliverable objects are gone.
5. **P5**: set `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` + custom domain when public reads ship.
