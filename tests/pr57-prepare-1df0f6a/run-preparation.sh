#!/usr/bin/env bash
# One invocation only. This script cannot start or dispose an acceptance stack.
set +x
set -Eeuo pipefail
set -C
umask 077
CURRENT=setup
trap 'rc=$?; printf "STOP: preparation/%s; exit=%s. Preserve receipts; no retry, cleanup or startup.\n" "$CURRENT" "$rc"; exit "$rc"' ERR
[[ "$#" == 0 ]]
export PATH="/home/redwan/.nvm/versions/node/v22.23.1/bin:$PATH"
unset NODE_OPTIONS NODE_PATH
[[ "$(node --version)" == v22.23.1 ]]
[[ "$(uname -s)" == Linux ]]
BUNDLE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
CONTROL=/home/redwan/pr57-operator-1df0f6a
NEW=/home/redwan/pr57-checkout-1df0f6a
PRIVATE=/home/redwan/pr57-private-1df0f6a
CANDIDATE=1df0f6aa6572093e5399aa20fcf043703037d96a
(cd "$BUNDLE" && sha256sum --check --strict SHA256SUMS)
for target in "$CONTROL" "$NEW" "$PRIVATE"; do
  [[ ! -e "$target" && ! -L "$target" ]]
done
mkdir -m 0700 "$CONTROL"
install -m 0600 "$BUNDLE/prepare-review.mjs" "$CONTROL/prepare-review.mjs"
install -m 0600 "$BUNDLE/images.json" "$CONTROL/images.json"
printf '%s %s\n' '1524d4753523f76ab3538b3f5eb9510eb8f849f42c214eb5b28d2bf80f84421c' "$CONTROL/prepare-review.mjs" | sha256sum --check --status
printf '%s %s\n' 'a2bd96d7e5dca54ef759df16fd859e0b428f53e9a915721e0bea0b0190f7ea6e' "$CONTROL/images.json" | sha256sum --check --status
node --check "$CONTROL/prepare-review.mjs"
run_private() {
  local label="$1" rc suffix
  shift
  [[ "$label" =~ ^[a-z0-9-]+$ ]]
  CURRENT="$label"
  for suffix in log exit command.txt; do
    [[ ! -e "$CONTROL/$label.$suffix" && ! -L "$CONTROL/$label.$suffix" ]]
  done
  printf 'cwd=%s\n' "$PWD" > "$CONTROL/$label.command.txt"
  printf '%q ' "$@" >> "$CONTROL/$label.command.txt"
  printf '\n' >> "$CONTROL/$label.command.txt"
  if "$@" > "$CONTROL/$label.log" 2>&1; then rc=0; else rc=$?; fi
  printf '%s\n' "$rc" > "$CONTROL/$label.exit"
  printf '%s: exit=%s\n' "$label" "$rc"
  if [[ "$rc" != 0 ]]; then
    case "$label" in
      before-review|checkout-review|tests-review|prepared-review)
        grep '^STOP: prepare-review/' "$CONTROL/$label.log" || true ;;
    esac
  fi
  return "$rc"
}
run_private before-review node "$CONTROL/prepare-review.mjs" before
run_private clone env GIT_TERMINAL_PROMPT=0 git clone \
  --no-checkout --single-branch --branch fix/audit-followup-remediation \
  https://github.com/redwan-cse/redwan.work.git "$NEW"
run_private checkout git -C "$NEW" checkout --detach "$CANDIDATE"
run_private checkout-review node "$CONTROL/prepare-review.mjs" checkout
cd "$NEW"
run_private isolated node --test \
  tests/acceptance/phase-b.test.mjs \
  tests/acceptance/test-guard.mjs \
  tests/reliability/acceptance-environment.test.mjs \
  tests/reliability/disposable-bootstrap.test.mjs \
  tests/reliability/recovery-acceptance-contracts.test.mjs
run_private tests-review node "$CONTROL/prepare-review.mjs" tests
run_private prepare env BUILDKIT_PROGRESS=plain \
  node tests/acceptance/disposable-bootstrap.mjs prepare "$CONTROL/images.json" "$PRIVATE"
run_private prepared-review node "$CONTROL/prepare-review.mjs" prepared
printf '%s\n' 'PREPARED_ONLY: stop here. No startup approval has been given.'
for name in before-review checkout-review tests-review prepared-review; do
  printf '\n=== %s (allowlisted report) ===\n' "$name"
  cat "$CONTROL/$name.log"
done
