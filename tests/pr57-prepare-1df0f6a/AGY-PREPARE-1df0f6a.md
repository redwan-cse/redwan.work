# AGY: fresh preparation for PR57, then stop before startup

## Current state and authority

Brain accepted your reported exact failed-run disposal: seven containers and one network absent, actual exit0, 54 previous images and 7 volumes preserved, 79 original private files unchanged, and the existing 700-byte preflight export preserved. This is your local execution evidence, not a claim that Brain directly inspected Docker. Keep those receipts and original files. Do not repeat disposal or the old lost-tmpfs exception.

Continue the existing approved remediation plan and PR57/original issues28-47. Do not create a backlog, restart brainstorming, improvise diagnostics, change source, or activate another implementation cycle. Brain owns engineering; you are executing the supplied preparation procedure.

Exact repaired candidate: `1df0f6aa6572093e5399aa20fcf043703037d96a`.
Approved development branch: `fix/audit-followup-remediation`.
PR57 is open, draft, unmerged and blocked; main remains `31ff564d815b912bce3ab6d26a8ddc744ef1cad0`.

This handoff authorizes only a new clean detached checkout, the guide's bounded dependency-free checks, and preparation of fresh candidate-bound runner/app images and new synthetic private material. The seven-service runtime must NOT be started. There is no new disposal authority, production access, migration/reset, scheduler activation, real email, main push, merge or deployment authority.

## Already verified: skip these

The storage source repair is already pushed, byte-read back and tested. No new application defect was reported by successful disposal, so no source change or cosmetic commit is warranted. Do not edit either checkout, Dockerfile, test, migration, private plan, or running-container source.

Final-head GitHub evidence was refreshed by Brain:

- [Regression, lint, types, build and manifests](https://github.com/redwan-cse/redwan.work/actions/runs/36293454039/job/108547789333): success, including the mandatory locked-SDK endpoint probes in the normal regression gate.
- [Disposable database](https://github.com/redwan-cse/redwan.work/actions/runs/36293454064/job/108547789558): success.
- [Combined real Auth/mailbox](https://github.com/redwan-cse/redwan.work/actions/runs/36293454036/job/108547922185): success, completed at 10:19:22 Asia/Dhaka on27 September. It is no longer in progress.
- [F20 challenge](https://github.com/redwan-cse/redwan.work/actions/runs/36293454050/job/108547789401): still failed/deferred. This handoff does not resolve or bypass it.

Skip prior socket/permission/cutoff/storage diagnosis, old image preparation, old runtime/bootstrap/preflight/suite2, and host npm/lint/type/build repetitions. The old preflight pass is preserved historical evidence, not acceptance for the new candidate. Do not transfer it to the new run.

The one guide command below runs once from the NEW checkout to bind the local checkout to its preparation evidence. It expects84 checks, including the later regressions; the guide's69-count paragraph is historical. These84 checks are not live acceptance. The required fresh app image build is separate from needlessly rerunning host build commands.

## Step 1. Place the unchanged package

Extract the ZIP so these files are under `J:\DevDrive\redwan.work\tests\pr57-prepare-1df0f6a`:

- `AGY-PREPARE-1df0f6a.md`
- `run-preparation.sh`
- `prepare-review.mjs`
- `images.json`
- `VERIFICATION.json`
- `SHA256SUMS`

Use WSL Ubuntu/Linux Bash. The Windows directory is input transfer only. The script creates these NEW Linux-native paths, outside existing checkouts and private evidence:

| Purpose | Exact path |
|---|---|
| Private command receipts and reports | `/home/redwan/pr57-operator-1df0f6a` |
| Detached exact checkout | `/home/redwan/pr57-checkout-1df0f6a` |
| New synthetic preparation/material | `/home/redwan/pr57-private-1df0f6a` |

Do not source any old `session.sh`; it binds older candidates/runs. Do not overwrite existing paths or choose another directory to retry. If any new path already exists, stop and report that setup condition. If this exact preparation has already completed with real receipts, return those instead of repeating it; do not treat partial output as success.

Leave old private directories, disposal receipts, image IDs, volumes and unrelated resources alone. Keep the Docker daemon stable during this bounded run and pause other Docker builds/create/remove/prune work. A fresh preparation-window snapshot governs preservation, not a pre-reboot global network snapshot.

Preparation needs internet access for the public repository, reviewed registry digests, locked npm dependencies and browser packages. It uses the local Docker builder; do not switch to remote builders or substitute images when a fetch fails.

## Step 2. Run one command block, once

```bash
set +x
set -euo pipefail
BUNDLE=/mnt/j/DevDrive/redwan.work/tests/pr57-prepare-1df0f6a
cd "$BUNDLE"
sha256sum --check --strict SHA256SUMS
bash ./run-preparation.sh
```

Expected initial output, not an observed result from your machine: each package checksum says `OK`. The script selects Node22.23.1 from the existing NVM path, uses umask077/no-clobber, and clears inherited Node injection options only in its own process. It does not change your global configuration.

The supplied script executes this exact ordered sequence automatically. Do not run the internal commands separately:

1. `before-review`: read the original disposal receipt/exit and preserved preflight file, check the expected local daemon and exact old-resource absence, then take a new private file/resource snapshot. This is read-only validation, not another cleanup.
2. `clone` and `checkout`: clone the approved development branch into the new path, then detach at the exact full candidate SHA.
3. `checkout-review`: verify clean HEAD and thirteen source/document blobs, including the storage repair, regression file and unchanged launcher/recipes.
4. `isolated`: execute the existing dependency-free guide command:

```text
node --test tests/acceptance/phase-b.test.mjs tests/acceptance/test-guard.mjs tests/reliability/acceptance-environment.test.mjs tests/reliability/disposable-bootstrap.test.mjs tests/reliability/recovery-acceptance-contracts.test.mjs
```

5. `tests-review`: require the ACTUAL exit0 and exactly84 tests/84 passes/0 failures/0 cancelled/0 skipped/0 todo from its saved TAP footer.
6. `prepare`: from the new checkout, execute the committed preparation action:

```text
env BUILDKIT_PROGRESS=plain node tests/acceptance/disposable-bootstrap.mjs prepare /home/redwan/pr57-operator-1df0f6a/images.json /home/redwan/pr57-private-1df0f6a
```

7. `prepared-review`: verify actual preparation exit0, fresh credentials, all40 committed source migration hashes, new image IDs/labels/users/architecture, recipe/source/browser-lock hashes, exact generated-plan equality and the new private-plan hash, successful non-root build probes, no runtime state/owned resources, and preservation of all pre-existing images/resources/private evidence. A cached successful probe is explicitly reported as cached, not freshly executed.
8. Print only four allowlisted reports and `PREPARED_ONLY`, then stop. No start command or start token is included.

Each step prints `<step>: exit=<actual code>`. Test and build output remains in private0700/0600 paths; do not stream or paste those raw logs. The two image builds can take several minutes. Wait for the synchronous command's actual exit; do not launch another process because output is quiet.

## Reviewed image inputs: unchanged

| Role | Registry reference |
|---|---|
| node | `node@sha256:175215a1f306ed5df592434b99cc2019f70624373fe49cb659240a618a846aed` |
| database | `postgres@sha256:7bade6d532592ca8ce7ee32def7399dad2607c4ea5583839fc4352a095a11ea6` |
| auth | `supabase/gotrue@sha256:7e813221b93fbf54b515036438550e483bfaf057b9db52fe9bc1ce91c47e817e` |
| rest | `postgrest/postgrest@sha256:aa7e96af2d01219a09bc00c75de28171b1f9fda17ea455a931e4fb6d317089e0` |
| storage | `cgr.dev/chainguard/minio@sha256:039800e64ec7247d2fde7cff3697e964f6fe20b6d7d2c46aa7d82cc63355d512` |

These are registry manifest references, not local image/config IDs. Preserve that distinction in reporting. The PostgreSQL multi-platform index `sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0` is provenance, not a substitute for the reviewed platform manifest. Do not reuse the unidentified91eb910c image.

Expected new runner recipe SHA256: `b9b12d1093b6fa2723f6e177640abc620a1dad654454888f9515037066b4c26e`.
Expected browser-lock SHA256: `0a0fe8bd0ce7989bacf2a842b9817aebede79cbb753bbaeba3265f20a0cd87b0`.
Runner/app image IDs, source-archive hash and private-plan hash must come from actual local output. Do not invent or reuse the previous candidate's values. Reusing successful build layers is allowed; relabeling old candidate images is not.

The private plan must still use current `sb_publishable_`/`sb_secret_` synthetic API keys, ES256/JWKS, no octet signing key, no HS256 fallback, an explicitly empty `GOTRUE_JWT_SECRET`, and public JWKS in `PGRST_JWT_SECRET`. SQL `service_role` remains a valid database role.

Planned hardening remains512 PIDs per service, dropped capabilities, no-new-privileges, DNS127.0.0.1, pull-never, one internal bridge, no published ports, and no persistent/bind/host/socket mounts. Only runner has a read-only root. Do not claim all writable paths are tmpfs or all service roots are read-only.

## Step 3. Return actual evidence and stop

Expected success shape below is a DEMO, not already-observed local results:

```text
before-review: exit=0
clone: exit=0
checkout: exit=0
checkout-review: exit=0
isolated: exit=0
tests-review: exit=0
prepare: exit=0
prepared-review: exit=0
PREPARED_ONLY: stop here. No startup approval has been given.
```

Return the package checksum result, actual step exit lines, and the four complete allowlisted reports that the script prints: `before-review.log`, `checkout-review.log`, `tests-review.log`, and `prepared-review.log`. The final report contains the actual candidate, image identities, plan/source/recipe hashes,40 migration name/hash rows, seven planned service rows, modes and preservation counts. Do not substitute prose guesses for its fields.

Expected final report: `phase=prepared-not-provisioned`, `stateAbsent=true`, `ownedContainers=0`, `ownedNetworks=0`, `freshMaterialComparedPrivately=true`, `generatedPlanMatches=true`, `existingContainersNetworksVolumesUnchanged=true`, and `startAuthorized=false`. The planned7 containers/1 network are NOT created runtime resources. Source migration hashes are NOT an applied database ledger. Browser image preparation is NOT actual Chromium A-E acceptance.

Confirm whether any source edits, retries, cleanup, startup or other operations occurred. Preserve all files locally. Keep `before.private.json`, raw logs, material, state, plans, environment values, credentials, keys, JWTs, cookies, signed URLs, provider bodies and fixture data private. Only the printed allowlisted reports should be shared.

On any failure, stop immediately and return only the actual step/exit and fixed `STOP: preparation/...` or `STOP: prepare-review/...` category. Preserve partial images/directories/logs; do not retry, delete them, bypass guards, alter expected counts, install substitute tools, edit code or invent another diagnostic script. Brain owns the next engineering decision.

## Next gate and remaining risks

After the actual preparation report is reviewed, Brain will present the exact new7-container/1-network plan for separate owner startup approval. All old start approvals are consumed and apply to older candidates. Do not start in anticipation of approval.

The new candidate still needs its own full eight-suite local acceptance in order, including real storage and Chromium A-E. Historical results from25ac040 do not count. F20 remains failed/deferred; the separate retention-inventory path-style finding remains outside this backup/restore repair; independent review and production readiness are not established. No release is authorized.

## Verification of this handoff

Brain inspected the live [PR57](https://github.com/redwan-cse/redwan.work/pull/57) head, [exact candidate](https://github.com/redwan-cse/redwan.work/commit/1df0f6aa6572093e5399aa20fcf043703037d96a), repository rules, approved plan, current ledger, bootstrap guide and byte-verified preparation source. This reuses the approved design and unchanged repository preparation machinery.

Actual operator verification:34 isolated Node tests passed with0 failed/cancelled/skipped/todo, plus3 Bash execution checks for success, failure-stop, and no-clobber behavior. JavaScript and Bash syntax checks passed. The full prepared-report path was exercised with real repository plan/recipe generators, real private fixture files and simulated Git/Docker responses; no secret fixture values appeared in its safe output. Self-review only, not independent review.

Brain has not executed new local Docker preparation or runtime acceptance. The sandbox has no Docker and no internet access; current CI evidence comes from GitHub, not a fabricated local pass. No repository source was changed for this successful-disposal continuation. `VERIFICATION.json` records the exact evidence and delivered helper fingerprints.
