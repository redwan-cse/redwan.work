# R2 Object Storage — Contact Attachments

Architecture and runbook for the Cloudflare R2 storage behind the contact form's
file attachments (Phase 2). The user-facing copy lives in
[`docs/contact/README.md`](../contact/README.md) and on `/privacy`.

## Architecture

Two buckets are used (both on one R2 endpoint, separate scoped API tokens):

| Bucket | Access | Used for |
|---|---|---|
| `R2_PRIVATE_BUCKET` | Private — reachable only via presigned URLs and server-side credentials | Contact attachment uploads under the `contact/` prefix |
| `R2_PUBLIC_BUCKET` | Public-read via `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | Provisioned for future public assets; nothing written or read yet (deferred to P5) |

All private-bucket access goes through the server-only helpers in `lib/r2.ts`
(`import 'server-only'`); credentials never reach the browser. The browser only
ever sees short-lived presigned PUT URLs.

### Key scheme

```
contact/<upload-folder-uuid>/<file-uuid>.<ext>
```

Both UUID segments are random v4 generated at presign time (`lib/r2.ts`), so
keys are unguessable and each upload batch gets its own folder. The full shape
is enforced by a strict regex (`isValidContactKey`) before any key from the
browser is accepted at submit time.

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
   the attachment metadata array (key/filename/mime/size/retained) is validated
   key-by-key and stored in `leads.attachments` jsonb.

### Retention cron

`GET /api/cron/r2-retention` (registered in `vercel.json`, daily at 03:00 UTC):

1. Requires `Authorization: Bearer <CRON_SECRET>` — timing-safe compare
   (mirrors `/api/revalidate`). Wrong/missing secret → `401`.
2. R2 not configured → `503`.
3. Loads the retained set: leads whose `attachments` contain an entry flagged
   `"retained": true` (jsonb containment `attachments @> '[{"retained":true}]'`).
4. Lists all objects under `contact/`, computes stale keys with
   `staleObjectKeys(objects, cutoff, retained)` where `cutoff = now − 90 days`
   (strict `<`; retained keys always skipped).
5. Batch-deletes stale keys (1000/chunk). Any earlier failure aborts before
   deletion runs (fail-closed).
6. Responds `200 {"deleted": n, "examined": m}`.

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

Positive-deletion path: deterministic via T4-d (pure function over real inputs);
first production purge observed after 90 days of live traffic is an owner
follow-up below.

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
4. **P5**: set `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` + custom domain when public reads ship.
