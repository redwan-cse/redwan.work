# AGY: approved exact disposal, then stop

## Authority and objective

The owner approved `approve_pr57_storage_failed_run_disposal` for `test-run-8a396a5c-b211-4f11-aef1-b893afb7d00d`, message `80180078016862`, thread `80180077955507`. This is the execution handoff for that approval, not a fresh approval request and not evidence of completed disposal.

Remove only the seven retained failed-run containers and their one internal bridge network. The old candidate is `25ac040a4d099cad6342aec44863d21aad00f947`. Expected daemon: `0c15eeda-6839-43e6-a8ee-585570f98427`.

| Target | Exact Docker ID |
|---|---|
| database | `7ce759b9f86990cec6bedb683ecfb8c332d12ca6fab046136373e1e2a57592d8` |
| runner | `217bbbd451e949805642a9a3385cf430edf77759a8a6fa69b5201b740381693d` |
| auth | `59e490101ae72f73d6aaf8c25e7eed8281b6f860af2f7b17fb8363aca53d06fd` |
| rest | `2c1de974b2a51c8c614bc928980486c3296b529366862b361de4cd9386a38c1c` |
| storage | `4de1989a98066f9898dcc95221c40dca8e6741d205ff122f5fc95e25b1704b70` |
| gateway | `6d0022061698c51287cf8858482fb88df6c69501e15095b68e3c43c26a6b6bbb` |
| app | `dddf690a003d6299a6697e3b2ba12cb779db599ac63048b08d070d9599841a86` |
| internal bridge | `7ebe86d404add08dbd02a60cea31cc8099fcf240d55ec69ba3c8ac6a1e922eda` |

Container names are the exact run ID followed by `-` and the role. The network name is the exact run ID. The helper rechecks IDs, names, ownership labels, images, current network membership and private state before invoking the unchanged repository disposer.

Removing these resources destroys their disposable writable layers and tmpfs data. Preserve all images, volumes, unrelated resources, and host-side preparation/material/state/logs/receipts/evidence. No production data is targeted. The preflight host export must still be 700 bytes with SHA256 `6c1471c291f23f050afc7ba4119b662996c8e289fe77bcd28d2e86cd9c3f2273`.

## Skip completed work

Do not rerun bootstrap, readiness, preflight, suite2, earlier diagnostics, migration checks, source tests or old disposal helpers. Do not run the old evidence-loss exception or tmpfs exporter. Do not source the old session file: its `FAILED_RUN` describes an earlier run. Do not change repository files, patches, images or container contents.

The repaired candidate is `1df0f6aa6572093e5399aa20fcf043703037d96a`. Do not checkout/build/prepare/start it in this handoff. Fresh preparation follows actual disposal evidence; startup will require separate reviewed-plan approval. No main push, merge, deployment, scheduler, email or production access is authorized.

## Step 1. Place this exact package

Extract the supplied ZIP so these files exist under `J:\DevDrive\redwan.work\tests\pr57-storage-disposal-8a396a5c`:

- `AGY-APPROVED-DISPOSAL.md`
- `dispose-approved.mjs`
- `VERIFICATION.json`
- `SHA256SUMS`

Use WSL Ubuntu and Linux Bash. Do not edit or reconstruct the script. The Windows directory is only the input transfer location; execution and all private output are under Linux-native `/home/redwan`.

Pause other Docker create/remove/prune/build operations for this short disposal window. Leave the retained stack as it is, including if containers have exited. Do not restart it. Existing exported host evidence, rather than new runtime acceptance, is required. Unexpected IDs, missing evidence or a changed daemon are stop conditions, not reasons to bypass a guard.

Expected setup: package checksum lines show `OK`. These are expected results, not observations from your machine.

## Step 2. Execute this block once

The block creates a new private output directory. If it already exists, stop and report that fact; never delete it or pick another directory to retry. Use one Bash invocation, not independently pasted partial commands. The helper takes a fresh snapshot of current resources and all files under the existing private/operator directories, verifies it again immediately before deletion, and invokes the original disposer exactly once. It then reads back target absence and preservation. No global or image-ancestor cleanup is used.

```bash
set +x
set -euo pipefail
set -C
umask 077
export PATH="/home/redwan/.nvm/versions/node/v22.23.1/bin:$PATH"
[[ "$(node --version)" == "v22.23.1" ]]
[[ "$(uname -s)" == "Linux" ]]
BUNDLE=/mnt/j/DevDrive/redwan.work/tests/pr57-storage-disposal-8a396a5c
OUT=/home/redwan/pr57-disposal-8a396a5c
(cd "$BUNDLE" && sha256sum --check SHA256SUMS)
[[ ! -e "$OUT" && ! -L "$OUT" ]]
mkdir -m 0700 "$OUT"
install -m 0600 "$BUNDLE/dispose-approved.mjs" "$OUT/dispose-approved.mjs"
printf '%s %s\n' 'a0363c383118283d44083c3a14eb72d403e7ac3e7bf4609799c8308fbfc96b68' "$OUT/dispose-approved.mjs" | sha256sum --check --status
node --check "$OUT/dispose-approved.mjs"
if node "$OUT/dispose-approved.mjs" > "$OUT/operator.log" 2> "$OUT/operator.err"; then
  rc=0
else
  rc=$?
fi
printf '%s\n' "$rc" > "$OUT/operator.exit"
printf 'approved-disposal: exit=%s\n' "$rc"
if [[ "$rc" == 0 ]]; then
  cat "$OUT/safe-result.json"
else
  # This helper emits only fixed checkpoint text, never raw assertions or state.
  grep '^STOP: approved-disposal/' "$OUT/operator.err" || true
  printf '%s\n' 'STOP. Keep all receipts. No retry, source edit, manual cleanup or new start.'
fi
exit "$rc"
```

The unchanged removal command executed inside the wrapper is exactly:

```text
Working directory: /home/redwan/pr57-checkout-25ac040
Node 22.23.1:
node tests/acceptance/phase-b.mjs dispose /home/redwan/pr57-private-25ac040/state.json test-run-8a396a5c-b211-4f11-aef1-b893afb7d00d
```

Do not execute that command separately or bypass the wrapper. Its source blob must match `84bdab4de3a22309d66ca62ee0909849a79bda4d`, checked before execution. All Docker inspections and original command output stay private. No raw state/environment/credentials are printed.

## Step 3. Interpret and return the actual result

Expected success, not an already-observed result:

- `approved-disposal: exit=0`.
- Safe receipt binds the same candidate, run and approval.
- `disposalExit: 0`, `containersAbsent: 7`, `networksAbsent: 1`.
- `unrelatedResourceIdsPreserved: true`, `preflightEvidencePreserved: true`.
- Previous image/volume counts and unchanged private-file count are actual numbers computed locally. Do not invent those counts.
- `replacementStartAuthorized: false`.

Return only the checksum check result, actual `approved-disposal` exit line and complete `safe-result.json` printed by the helper. Say whether any source/container changes, retries or additional operations occurred. Do not paste `before.json`, state, material, plan, raw logs, environment arrays, fixture records, provider responses, cookies, JWTs, signed URLs or credentials. Keep the entire output directory and all original private files locally.

On failure: return only the actual exit and fixed `STOP: approved-disposal/<checkpoint>` line. If failure occurs before the helper runs, report the failed setup step without raw sensitive output. Keep all receipts and any remaining resources. A failure during removal can leave a partial disposal; do not claim nothing was touched and do not rerun or manually finish it. Brain will inspect the evidence and own the next decision.

After success, stop. No new environment start is authorized.

## Verification and limits

Brain verified the existing repository disposer source and its exact Git blob, ran 24 isolated boundary/fixture tests successfully with zero failures/skips/cancellations, and syntax-checked the delivered JavaScript and Bash. Tests cover exact-target binding, wrong images/labels/candidates, unexpected network members, running and exited targets, persistent mounts, unrelated container/network/image/volume preservation, file tampering/symlinks/modes, one-shot gating, wrong-daemon refusal, and the actual unchanged disposer against a fake Docker adapter.

This is self-review and isolated testing, not independent review or local Docker acceptance. Brain has no Docker access here and has not deleted your resources. The complete wrapper has not been run against your live daemon; only AGY's actual result can establish completed disposal. No repository source change was needed for this already-approved local operation.
