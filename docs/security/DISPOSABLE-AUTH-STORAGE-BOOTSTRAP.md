# PR57: disposable Auth and storage bootstrap

## Current checkpoint: 26 September 2026

Owner approved the remaining 11-file recovery-development batch. The old guard suite is replaced with immutable-session tests; saved-import tests assert ready/completed states; Chromium A-E replaces skipped placeholders. It covers checkpoint reload without writes, fresh confirmation, new-tab manual resume, dropped responses including final commit, read-only completed results, cross-admin denial, unsealed/expired states, disabled storage, forgetting the browser reference, mobile geometry and keyboard focus. This is not a full accessibility audit.

Section4 now forwards destination Host without changing Origin, requires upstream HTTP200 before accepting the lost-response fault, and verifies retained archive hashes. Section6 checks conditional replacement before deleting the actual finalized object, without recreating it. Section7 checks uploading state and safe fields. PostgREST uses the pinned image's default CMD rather than a PATH guess.

Migration0038 intentionally permits service_role SELECT only on recovery_imports. The disposable bootstrap, after forty unchanged migrations, installs acceptance_expire_recovery_import(actor,id): service-role-only execution and JWT-role check; synthetic @example.test actor; one recent unfinished actor-owned import aged once. No table UPDATE grant. This is a test-only control, not an app migration; never install it in production. Browser D checks anonymous refusal, wrong actor, direct-write denial and repeated expiry refusal.

### Commands and evidence boundaries

Use Node22.23.1, WSL2/Linux-native storage and a clean exact-candidate checkout. Do not bypass NTFS mode checks or edit running-container source.

```sh
node --test tests/acceptance/phase-b.test.mjs tests/acceptance/test-guard.mjs tests/reliability/acceptance-environment.test.mjs tests/reliability/disposable-bootstrap.test.mjs tests/reliability/recovery-acceptance-contracts.test.mjs
```

69 dependency-free checks passed, zero failed/skipped. Six desired-contract regressions first failed; the missing expiry-control regression separately failed before implementation. Source assertions do not certify live behavior.

After separately approved provisioning, run in order and stop on failure:

```sh
for suite in environment-preflight real-backup-restore section4-interrupted-restore section5-session-authorization section6-staging-replay section7-browser-usability failing-resume-after-reload test-browser-resume; do
  node tests/acceptance/phase-b.mjs run "$PRIVATE_DIRECTORY/state.json" node --test "tests/acceptance/$suite.mjs" || exit 1
done
```

Do not glob every acceptance file. Private runner evidence /tmp/recovery-browser-evidence.json exists only after A-E pass; verify exit code and zero skips too. FixtureTracker retains resources pending explicit owned-run disposal, not cleanup proof. Raw assertion logs may contain private provider/fixture material; share redacted summaries only.

Publisher metadata rechecked 26 September: PostgreSQL17.11-bookworm linux/amd64 is postgres@sha256:7bade6d532592ca8ce7ee32def7399dad2607c4ea5583839fc4352a095a11ea6; multi-platform index sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0. Source: https://hub.docker.com/v2/repositories/library/postgres/tags/17.11-bookworm .

AGY's earlier 91eb910c44c7ed13f7f1a4ccadaa9ca72ef14cddc04cacb6e070e48eb44731a3 remains unidentified, not an accepted substitute. Pull the reviewed reference; record RepoDigests separately from image Id, plus OS/architecture, PG_MAJOR, entrypoint, CMD and volume paths. Stop on mismatch. Inspect pinned PostgREST v14.17's actual CMD; amd64 and ARM recipes differ.

Actual Docker startup, Auth/SQL/storage/browser acceptance and final exact-head CI remain pending at this documentation checkpoint. The sandbox has no Docker and no internet access. A separate AI source review found the expiry fixture permission defect; its correction is not GitHub APPROVED review or runtime proof. F20 stays FAILED/DEFERRED, production unchanged, release blocked. Historical evidence below is preserved.

Approved scope: build a fresh isolated acceptance environment, not deploy or change production. This is the next slice after db2e514d50419d8469d3a4ccd0eab1248ce821da. The existing acceptance ledger and PR57 remain the project records; this document is an operational supplement, not a new backlog.

## What is implemented

`tests/acceptance/disposable-bootstrap.mjs` prepares a browser runner and built Next app, generates fresh opaque API credentials and an ES256 P-256 signing key, constructs the private seven-service plan, and initializes services in dependency order using the existing owned launcher. No provider credentials or private environment files are imported.

Startup order: database, runner, Auth, PostgREST, object storage, gateway, app. The launcher now supports a synchronous trusted host-side initialization callback. Failed initialization stops creation of later services and retains exact resource IDs. The callback is not executable code accepted from JSON.

Database initialization requires a freshly empty PostgreSQL17 database. It creates the Supabase API roles and an Auth-owned schema, then lets the real GoTrue binary run its own migrations. Afterwards it restores modern `request.jwt.claims` helpers: GoTrue's historical migrations overwrite uid/role with legacy-GUC-only readers. The bootstrap verifies caller claims before applying the exact committed application migrations 0001 through 0040, recording source hashes in a private ledger. Existing application migrations are not edited. No reset, drop, schema replay or scheduler provisioning is performed.

The stock database substrate is intentionally narrower than a full hosted Supabase installation. It includes the Auth/PostgREST primitives this application uses; it is not evidence of hosted extension, Cron, backup or configuration parity. API default grants are established before app migrations apply their intended revocations. SQL `service_role` remains a valid database role, not a legacy API key.

Storage initialization requires both synthetic buckets to be absent. It distinguishes a genuine 404 from permissions/network failures, creates each bucket and verifies existence. Neither bucket gets anonymous access or a permissive bucket policy. Partial creation is retained and reported, not deleted or relabeled successful cleanup. MinIO supplies synthetic S3 behavior only, not proof of hosted R2 behavior.

## Auth and gateway boundary

All JWTs generated by this bootstrap are ES256. Auth alone issues user sessions; no fake user sessions or permissive admin gateway are used. The disposable gateway accepts exact opaque API-key matches, translating only those keys into 60-second internally signed anon/service_role tokens. A caller's ES256 bearer is preserved for real GoTrue/PostgREST verification. Missing, arbitrary, duplicate, mismatched opaque, malformed or symmetric credentials cannot fall back to privileged authority. Browser use of the secret API key is denied. Application cookies are never forwarded to Auth/PostgREST.

This limited test gateway exposes only `/auth/v1/` and `/rest/v1/`. It is not a complete Supabase gateway implementation. It does not support query-string API keys, OAuth redirects, realtime, functions or hosted platform routing. Upstream redirects are refused, destinations are fixed, request/response sizes bounded, and bodies/tokens are not logged. The internal Docker network remains the primary egress boundary; request filtering is supplementary.

GoTrue v2.196.0 declares `JWT.Secret` as a required configuration field even when asymmetric keys are configured. The plan sets that field explicitly to the empty string, never a shared secret, and supplies only one ES256 signing JWK through `GOTRUE_JWT_KEYS`. There is no octet key and no HS256 fallback in the generated plan. Empty-field startup behavior still requires actual container execution. If the pinned image refuses this configuration, stop and investigate; do not supply a legacy secret to make it pass.

Source references inspected:
- [GoTrue v2.196.0 config](https://github.com/supabase/auth/blob/v2.196.0/internal/conf/configuration.go)
- [JWK selection and allowed methods](https://github.com/supabase/auth/blob/v2.196.0/internal/conf/jwk.go)
- [GoTrue initial schema](https://github.com/supabase/auth/blob/v2.196.0/migrations/00_init_auth_schema.up.sql)
- [Self-hosted opaque keys and asymmetric Auth](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys)

## Preparation

Use a clean checkout of the exact candidate, local Docker, Node22 and git/tar. Preparation needs internet access to fetch already-reviewed image digests and locked dependencies. Execution later occurs without external network access. Keep the new private output directory outside the checkout; do not place it in a shared/public artifact folder.

Supply a JSON image manifest containing exactly `node`, `database`, `auth`, `rest`, `storage`, each a registry `name@sha256:<64 hex>` reference. Do not paste placeholders into a runnable plan. Supported image contracts:

- Official Node22 Debian/Ubuntu image with apt-get, reviewed against Node22.23.1.
- Official PostgreSQL17 Debian image, UID/GID999, PGDATA volume `/var/lib/postgresql/data`, with pgcrypto available. Do not substitute Alpine/PG18 or supabase/postgres without adapting and testing their paths/users/bootstrap contract.
- `supabase/gotrue`, reviewed source v2.196.0, default `auth` command, UID1000.
- `postgrest/postgrest`, reviewed version v14.17.
- `cgr.dev/chainguard/minio`, approved repository candidate digest `039800e64ec7247d2fde7cff3697e964f6fe20b6d7d2c46aa7d82cc63355d512`, UID65532.

The bootstrap does not guess or silently update image digests. Record digest/version provenance when selecting the other four images.

```sh
node tests/acceptance/disposable-bootstrap.mjs prepare "$REVIEWED_IMAGES_JSON" "$NEW_PRIVATE_DIRECTORY"
```

Preparation creates private material, migration inventory, runner manifest, app build log, plan and preparation summary. The browser runner is built from the committed git archive with Playwright-core1.58.2 locked by npm integrity. The app build uses only public synthetic configuration. Private API/signing/database/storage credentials are runtime-only. No containers or network are launched by the bootstrap's `prepare` action (Docker's internal build machinery is separate).

## Start, preflight and acceptance

Review the generated plan and get owner approval before starting its seven containers and one internal network. No published ports, persistent volumes, host mounts, extra networks, production credentials or scheduler calls are permitted.

```sh
CANDIDATE=$(git rev-parse HEAD)
node tests/acceptance/disposable-bootstrap.mjs start "$PRIVATE_DIRECTORY" "START-$CANDIDATE"
node tests/acceptance/phase-b.mjs run "$PRIVATE_DIRECTORY/state.json" node --test tests/acceptance/environment-preflight.mjs
```

The app binds to its actual `app` network alias on port3000, matching the browser origin. This configuration is intended to remove the localhost mismatch without rewriting request Origin or changing the application's CSRF code. The real-browser preflight must demonstrate that behavior before it is considered verified.

A successful bootstrap reports `bootstrapped-not-accepted`. It does not automatically certify or execute restore scenarios A-E. A successful preflight certifies only its named readiness/auth/browser assertions. Phase D same-import partial restore, dropped final response, full account-state matrix and remaining usability acceptance still need their own real executions.

Never modify source inside running containers. Never dump private plans, material, JWTs, cookies, provider bodies or signed URLs into public logs. Inspect failures locally with sanitized categories; bootstrap result files retain candidate, phase, migration hashes and resource ownership, not secrets.

## Cleanup and recovery

No implicit disposal occurs. On failure, keep the private state and stop. Do not rerun initialization against that database or adopt its buckets. Inspect the exact owned inventory and obtain its required disposal confirmation before the launcher's existing `dispose` command. No global prune, image-ancestor filter, production reset or branch deletion is allowed. Partial resources count as retained, not cleaned.

## Evidence at implementation time

The new startup-order regression failed against the prior launcher: dependent services were created despite a failing initialization hook. After the hook and bootstrap implementation, 56 isolated checks passed (29 existing launcher checks, 12 environment-foundation checks, 15 new bootstrap checks). Tests include real local HTTP gateway requests with a synthetic upstream, real ES256 signature verification, credential denials, bucket failure adapters and the actual launcher's stop/retain behavior. They are not Docker/Auth/PostgreSQL/S3 integration passes.

Docker is unavailable in the development sandbox and the sandbox has no internet access. Prepared image builds, actual GoTrue startup with the empty legacy field, SQL migration application, real buckets and browser preflight remain unexecuted here. CI regression/lint/types/build evidence must be recorded for the exact commit separately. Self-review only; no independent reviewer is claimed. F20 remains failed/deferred. PR57 remains draft and release-blocked; main and production are unchanged.
