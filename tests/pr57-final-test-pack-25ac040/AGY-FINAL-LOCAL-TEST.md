# AGY: finish the approved local test, not another preparation cycle

You are the local execution operator. Brain owns investigation, code changes, regression tests, self-review, GitHub pushes, and exact-commit CI verification. Do not repair source, rewrite these instructions, invent a workaround, or create another helper. Execute the steps below and return actual evidence.

## Fixed scope

Use the existing checkout `/home/redwan/pr57-checkout-25ac040` and private preparation `/home/redwan/pr57-private-25ac040`.

Candidate: `25ac040a4d099cad6342aec44863d21aad00f947`.

The owner already approved **one start and eight ordered suites** with `START-25ac040a4d099cad6342aec44863d21aad00f947`. This is the same approval, not another start allowance. If the earlier handoff has already started, use its receipts and continue only never-attempted steps. Never launch a concurrent copy. A failed, interrupted, or ambiguous attempt stops execution; it does not authorize a retry.

Runner and gateway image: `sha256:9304c54c537335cd796ae845feda88473e80dae26700269702239b4e6fed25b1`.

App image: `sha256:4d4661ff2b03a1f7a11f0c4b37b62415f4766ab86166080e19244fcd9a4e76f7`.

Keep the already-reviewed five registry references, generated plan, fresh credentials, and unchanged migrations 0001 through 0040. The seven services and internal network are disposable; production is not involved. Do not fetch a newer branch head into this checkout.

**Skip all of this already-satisfactory work:** old-run disposal, old-failure reproduction, checkout creation, the 84 isolated checks, image downloads/builds, non-root build probes, preparation, and broad repository audits. A read-only freshness check is not a rebuild or a rerun of those tests.

**Do not:** push/merge/deploy, reset a remote database, touch production, send real email, activate schedulers, change Origin, weaken assertions, patch containers, restart stopped tmpfs containers, prune, dispose resources, or delete evidence. Existing committed test-fixture behavior is allowed only inside this exact owned run. No additional cleanup is authorized.

## 1. Open one Bash session and install the unchanged executor

Place the accompanying ZIP at `/home/redwan/pr57-final-test-pack-25ac040.zip`. Its top-level directory is `pr57-final-test-pack-25ac040`. The included executor is byte-for-byte identical to the previously authorized executor; this package does not introduce a replacement test framework.

Run:

```bash
set +x
set -euo pipefail
umask 077
export PATH="/home/redwan/.nvm/versions/node/v22.23.1/bin:$PATH"
[[ "$(node --version)" == "v22.23.1" ]]
[[ ! -L /home/redwan/pr57-final-test-pack-25ac040 ]]
unzip -n /home/redwan/pr57-final-test-pack-25ac040.zip -d /home/redwan/
export BUNDLE=/home/redwan/pr57-final-test-pack-25ac040
(cd "$BUNDLE" && sha256sum --check SHA256SUMS)
source /home/redwan/pr57-operator-25ac040/session.sh
export OPS="$CONTROL/run-ops-25ac040.mjs"
export EVIDENCE="$CONTROL/runtime-25ac040"
if [[ -e "$OPS" || -L "$OPS" ]]; then
  [[ -f "$OPS" && ! -L "$OPS" ]]
  cmp --silent "$OPS" "$BUNDLE/run-ops-25ac040.mjs"
else
  install -m 0600 "$BUNDLE/run-ops-25ac040.mjs" "$OPS"
fi
if [[ -e "$EVIDENCE" || -L "$EVIDENCE" ]]; then
  [[ -d "$EVIDENCE" && ! -L "$EVIDENCE" ]]
else
  mkdir -m 0700 "$EVIDENCE"
fi
[[ "$(stat -c '%a' "$OPS")" == "600" ]]
[[ "$(stat -c '%a' "$EVIDENCE")" == "700" ]]
printf '%s  %s\n' \
  '22154a9751e1087973efe6f4b3e438e0afb04308c7dd112af4cc580e105797c2' \
  "$OPS" | sha256sum --check --status
node --check "$OPS"
cd "$NEW"
```

Expected: checksum checks report `OK`; other checks exit 0. No containers are created and no existing file is overwritten. If a file differs or a check fails, stop and report the exact step. Do not chmod or overwrite existing evidence to force a pass.

Use this same shell for the remaining blocks. If a shell closes, repeat only Step 1 and the read-only progress inspection below, not the start or a test.

## 2. Inspect receipts and determine the next unexecuted step

This command reads private files locally but prints only a validated progress summary. It never starts, tests, restarts, or removes anything. Run it now and after an already-completed step if you need to determine where to continue.

```bash
node --input-type=module <<'PROGRESS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const {CONTROL, PRIVATE, EVIDENCE, OPS}=process.env;
const {CANDIDATE, SUITES, counts, validateEvidence}=await import(pathToFileURL(OPS));
const expected=[1,8,9,17,6,6,5,9];
const exists=p=>{try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const bytes=p=>{const s=fs.lstatSync(p);assert.ok(s.isFile()&&!s.isSymbolicLink());assert.equal(s.mode&0o777,0o600);return fs.readFileSync(p);};
const json=p=>JSON.parse(bytes(p).toString());
const mark=label=>['command.txt','log','exit'].map(x=>path.join(CONTROL,`${label}.${x}`));
const suiteFiles=n=>['log','exit','result.json','evidence.json'].map(x=>path.join(EVIDENCE,`${n}.${x}`));
let checkpoint='start-receipts';
try {
  const statePath=path.join(PRIVATE,'state.json');
  const start=mark('start-25ac040');
  if(![...start,statePath].some(exists)){
    assert.ok(!mark('readiness-25ac040').some(exists));
    assert.ok(!exists(path.join(EVIDENCE,'readiness.json')));
    assert.ok(SUITES.every(n=>!suiteFiles(n).some(exists)));
    console.log(JSON.stringify({candidate:CANDIDATE,next:'START',startAttempted:false}));
  }else{
    assert.ok(start.every(exists));
    assert.equal(bytes(start[2]).toString().trim(),'0');
    const state=json(statePath), started=json(start[1]);
    assert.equal(state.candidate,CANDIDATE);
    assert.match(state.runId,/^test-run-[a-f0-9-]{36}$/);
    assert.equal(state.services.length,7);
    const bind=r=>{assert.equal(r.candidate,CANDIDATE);assert.equal(r.runId,state.runId);};
    bind(started);assert.equal(started.state,'bootstrapped-not-accepted');
    const boot=json(path.join(PRIVATE,'state.json.bootstrap-result.json'));
    bind(boot);assert.equal(boot.state,'bootstrapped-not-accepted');
    checkpoint='readiness-receipts';
    const readyPath=path.join(EVIDENCE,'readiness.json'), readyFiles=mark('readiness-25ac040');
    if(![readyPath,...readyFiles].some(exists)){
      assert.ok(SUITES.every(n=>!suiteFiles(n).some(exists)));
      console.log(JSON.stringify({candidate:CANDIDATE,runId:state.runId,next:'READINESS',startAttempted:true}));
    }else{
      assert.ok(readyFiles.every(exists));assert.equal(bytes(readyFiles[2]).toString().trim(),'0');
      const ready=json(readyPath);bind(ready);
      assert.deepEqual(json(readyFiles[1]),ready);
      assert.equal(ready.phase,'runtime-readiness-only');assert.equal(ready.migrations.length,40);
      assert.deepEqual(ready.migrations,json(path.join(PRIVATE,'migrations.json')).map(({name,sha256})=>({name,sha256})));
      assert.deepEqual(ready.expiryPrivileges,{anon:false,authenticated:false,service_role:true});
      assert.equal(ready.gatewayNegativeAuthority,true);assert.equal(ready.publicJwksES256,true);
      assert.deepEqual(ready.bucketChecks,[
        {bucket:'synthetic-private',authenticatedHead:true,anonymousStatus:403},
        {bucket:'synthetic-public',authenticatedHead:true,anonymousStatus:403}
      ]);
      const passed=[];let next='COMPLETE';
      for(const [i,name]of SUITES.entries()){
        checkpoint=name;
        if(!suiteFiles(name).some(exists)){
          assert.ok(SUITES.slice(i+1).every(n=>!suiteFiles(n).some(exists)));
          next=name;break;
        }
        const r=json(path.join(EVIDENCE,`${name}.result.json`));bind(r);
        assert.equal(r.suite,name);assert.equal(r.accepted,true);assert.equal(r.exit,0);
        assert.equal(bytes(path.join(EVIDENCE,`${name}.exit`)).toString().trim(),'0');
        const c=counts(bytes(path.join(EVIDENCE,`${name}.log`)).toString());
        assert.deepEqual(r.counts,c);assert.equal(c.tests,expected[i]);
        if(i===0||i===7){
          assert.equal(r.evidence?.preserved,true);assert.equal(r.evidence?.identityValid,true);
          const b=bytes(path.join(EVIDENCE,`${name}.evidence.json`));
          assert.equal(createHash('sha256').update(b).digest('hex'),r.evidence.sha256);
          validateEvidence(i===0?'preflight':'browser',JSON.parse(b.toString()),state);
        }
        passed.push({suite:name,...c});
      }
      console.log(JSON.stringify({candidate:CANDIDATE,runId:state.runId,next,passed}));
    }
  }
}catch{
  console.error(`STOP: incomplete, failed, or mismatched receipts at ${checkpoint}. Do not rerun; use Step 6.`);
  process.exitCode=1;
}
PROGRESS
```

Follow the printed `next` exactly:

| Printed result | Action |
| --- | --- |
| `START` | Run Step 3 once, then Step 4. |
| `READINESS` | Skip Step 3 entirely. Run Step 4 once. |
| An exact suite name | Skip Steps 3 and 4 and the verified passed suites. Continue at that suite in Step 5. |
| `COMPLETE` | Run no more tests. Return the existing evidence using Step 6. |
| `STOP` or nonzero exit | Run no more start/test commands. Return the failure using Step 6. |

An incomplete receipt can mean a command is still running. Do not interrupt it or launch another copy; let the existing command finish if it is still active. If it was interrupted, report that. Never fabricate an exit file.

## 3. Start once, only when Step 2 printed START

First revalidate the existing preparation, without repeating tests or builds. This calls the same existing preparation checker and exact image/hash checks; it does not create another prestart receipt or overwrite an earlier one.

```bash
node --input-type=module <<'FRESHNESS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
try{
  const file=path.join(process.env.CONTROL,'review.mjs');
  const st=fs.lstatSync(file);
  assert.ok(st.isFile()&&!st.isSymbolicLink());assert.equal(st.mode&0o777,0o600);
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),'54b426ff1be2e52ee6508fca654eec30c2f24d57f7fccfebcc120c62f5e7b288');
  const {review}=await import(pathToFileURL(file));
  const {validateBindings}=await import(pathToFileURL(process.env.OPS));
  const p=await review('prepared');validateBindings(p);
  assert.equal(p.daemon.dockerId,'0c15eeda-6839-43e6-a8ee-585570f98427');
  console.log('PRESTART_PASS: same approved candidate, images, plan and private preparation.');
}catch{console.error('STOP: preparation changed or cannot be verified. No start authorized for a changed preparation.');process.exitCode=1;}
FRESHNESS
run_private start-25ac040 \
  node tests/acceptance/disposable-bootstrap.mjs start \
  "$PRIVATE" "START-25ac040a4d099cad6342aec44863d21aad00f947"
```

Expected: `PRESTART_PASS`, then `start-25ac040: exit=0`. The private start receipt must say `bootstrapped-not-accepted` with this candidate and a newly generated run ID. Bootstrap initializes only the fresh owned substrate, applies the 40 committed migrations, creates the two private synthetic buckets, and installs the restricted disposable expiry control.

**A nonzero start exit ends this attempt.** Do not retry, rebuild, restart containers, or run readiness/tests. Preserve the actual partial inventory and report it.

## 4. Verify actual runtime readiness once

Run only after a successful start and only if no readiness attempt already exists:

```bash
run_private topology-25ac040 \
  node tests/acceptance/phase-b.mjs check "$PRIVATE/state.json"
run_private readiness-25ac040 \
  node "$OPS" readiness
```

If a successful `topology-25ac040` receipt already exists but readiness has never been attempted, skip the first command. The readiness executor checks the current owned topology again. An incomplete or failed topology receipt is a stop, not permission to relabel and retry it.

Expected: both actual exits are 0. Readiness must prove:

1. Seven running owned containers on their one internal network, with the approved images and bindings.
2. All 40 actual database migration names/hashes equal the source manifest and bootstrap receipt.
3. Expiry RPC privilege checks: `anon=false`, `authenticated=false`, `service_role=true`.
4. Gateway negative-authority checks and public ES256 JWKS pass.
5. Both synthetic buckets accept authenticated HEAD; anonymous GET returns 403.

Keep 512 PIDs per service, dropped capabilities, no-new-privileges, DNS `127.0.0.1`, no published ports or persistent/bind/host/socket mounts. Only runner root is read-only; the other six roots remain writable. All declared mounts are tmpfs. Do not describe this as every writable path being tmpfs.

This is readiness only. It has not yet proven real user authorization or recovery acceptance.

## 5. Run the eight suites, in this exact order

Run each command separately. Inspect its safe result before the next command. Continue automatically on a complete pass; do not ask for another approval between suites.

The executor invokes the committed command below for the selected suite, captures its raw output directly to a private host log, records its actual exit, validates the TAP footer, and checks the exact owned run:

`node tests/acceptance/phase-b.mjs run "$PRIVATE/state.json" node --test tests/acceptance/SUITE.mjs`

That line explains the method; do not run it separately and duplicate the suite. Use the exact commands below.

For each suite, require `exit:0`, `accepted:true`, the expected test count, `pass=tests`, and zero `fail`, `cancelled`, `skipped`, and `todo`. Counts below are source-derived expectations for this exact candidate, **not execution results**. The full count includes the parent test and fixture subtests.

### 5.1 Environment preflight: expected 1/1

```bash
node "$OPS" suite environment-preflight
```

Method: gateway/JWKS and schema/storage checks; create and promote a synthetic admin; wait for its persisted token cutoff; sign in once; verify the actual JWT and caller-owned PostgREST read; exercise Chromium origin, authenticated catalog, 375px layout and keyboard entry.

Expected private evidence: `state=environment-ready`, `phase=complete`, `anonymousOrigin=true`, `authenticatedCatalog=true`, `mobileOverflow=false`, `keyboardEntry=true`. `acceptanceAE=not-executed` is correct here. A-E is suite 8, not preflight.

### 5.2 Real backup and restore: expected 8/8

```bash
node "$OPS" suite real-backup-restore
```

Method: fixture setup plus six scenarios covering ticket attachment and project deliverable backup/restore, a multi-file project restore, legacy mutable-file deletion refusal, and both authenticated HTTP round trips.

Expected: actual original/archive/restored bytes and hashes match; correct parents and file counts survive restoration; unsafe legacy deletion is refused; no active delivery email is created by restore. Deliverable restore records its required suppressed email event. Direct RPC scenarios are database/storage integration, not browser proof.

### 5.3 Interrupted restore: expected 9/9

```bash
node "$OPS" suite section4-interrupted-restore
```

Method: seed a two-file backup; checkpoint 1/2 without premature project/file rows; resume to 2/2 and commit; drop a real successful final response; test idempotent and concurrent commits, parent eligibility changes, and retained archives.

Expected: lost-response injection observes upstream HTTP 200 and an independently committed database result; retries return that same result; exactly one restored project and two files exist; actual restored bytes match; all retained archive digests match. Do not rewrite Origin or accept a dropped CSRF denial as a successful commit.

### 5.4 Current-session authorization: expected 17/17

```bash
node "$OPS" suite section5-session-authorization
```

Method: current profile, Auth ban, token cutoff, session refresh/revocation, role mismatch, anonymous access, CSRF, and already-issued storage URL behavior.

Expected: active pre-ban admin access succeeds; banned/deactivated/stale/anonymous API access is refused as asserted; cutoff/revoked page access redirects; authorized refreshed access succeeds; cross-origin POST is 403. Previously issued storage URLs remain storage-authorized until expiry, but the application refuses new URL issuance after revocation. This expected storage behavior is not an application-authorization bypass.

### 5.5 Staging replay: expected 6/6

```bash
node "$OPS" suite section6-staging-replay
```

Method: upload bytes A, finalize and register immutable proof; attempt a conditional overwrite of the actual finalized object; replay same-length bytes B through the still-valid staging URL; read back both storage objects and the generated backup.

Expected: finalized-object replacement is HTTP 412; staging may become B, while finalized and archived payloads remain A. Signing upload URLs for finalized/archive destinations is refused. Do not recreate an object or change the condition to hide failure.

### 5.6 HTTP interface protocol: expected 6/6

```bash
node "$OPS" suite section7-browser-usability
```

Despite its historical filename, this is **HTTP protocol testing, not Chromium usability testing**.

Expected: empty catalog page returns empty arrays and `hasNext=false`; corrupt/unregistered ZIP preview is 400 with the committed safe error; upload sizes below 22 bytes or above 100 MiB are 400; the actor-owned unsealed import exposes only `expiresAt`, `id`, `state=uploading`, with `cache-control=no-store`.

### 5.7 Saved partial restore: expected 5/5

```bash
node "$OPS" suite failing-resume-after-reload
```

The historical `failing-` filename does not make failure acceptable.

Method: build the real fixture, checkpoint 1/2, read the same saved import, resume to 2/2, commit, and issue an idempotent retry.

Expected: status is `ready` with the same import identity and safe field set; restored bytes and exact file identities match; final and repeated results are identical. This is the HTTP/database protocol test; actual page behavior is next.

### 5.8 Full Chromium A-E: expected 9/9 and all five named scenarios

```bash
node "$OPS" suite test-browser-resume
```

Require every original browser scenario, not just a green footer:

1. **A:** partial checkpoint survives reload without a write; a fresh confirmation is required; another tab can manually resume; 375px geometry and keyboard focus pass; completed reload does not repeat POST.
2. **B:** real intermediate/final responses are dropped after requests reach the application; server checkpoints permit manual recovery; database completion and read-only reload recover the result; final commit occurs once.
3. **C:** another admin cannot load/resume the owner's import; the owner's checkpoint is unchanged.
4. **D:** unsealed validation reaches ready; anonymous/foreign-actor expiry calls and direct service-role table writes remain denied; the restricted disposable expiry transition succeeds once; expired unfinished state has no restore control or result.
5. **E:** storage-disabled manual recovery works; forgetting the browser reference clears only the pointer, not server state.

Expected evidence: `state=passed`, exact candidate/run ID, and all five A-E names in order. The entire Node test process, including teardown, must exit 0. An artifact written before a later teardown failure is not a passing suite.

### What the output should look like

Illustrative output shape only; placeholders are not actual evidence:

```json
{
  "candidate": "25ac040a4d099cad6342aec44863d21aad00f947",
  "runId": "<actual generated run ID>",
  "suite": "environment-preflight",
  "exit": 0,
  "counts": {"tests": 1, "pass": 1, "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0},
  "evidence": {
    "preserved": true,
    "identityValid": true,
    "sha256": "<actual exported file SHA-256>",
    "byteLength": 1234
  },
  "accepted": true
}
```

The byte length above is an example, not an expected length. Suites 2 through 7 legitimately report `evidence:null`; their actual private TAP log and exit receipt are the evidence.

For preflight and A-E, the unchanged executor immediately exports the original tmpfs JSON through a verified live runner using `docker exec`, never `docker cp`. Exported files are private 0600 and non-overwriting. Do not reboot or shut down before export. Never reconstruct missing evidence.

## 6. Return one useful result, then hand engineering back to Brain

Stop at the first failing command, missing required assertion, unexpected count, skip, cancellation, incomplete receipt, or evidence-export failure. Do not run later suites to work around it. Do not repeat a failed suite for a nicer log.

Run the Step 2 progress inspection again after all suites pass. `next=COMPLETE` validates the saved receipts and evidence bindings; it does not execute tests. Expected source-derived total if every suite completed is 61 tests across the eight suites. Report actual per-suite counts, not merely this expected total.

On success, return:

1. Exact candidate and actual run ID.
2. Actual start, topology and readiness exits; 40/40 migration hash agreement; two private bucket checks; ES256/JWKS and real-user session result.
3. Each of the eight safe `*.result.json` objects, including actual counts.
4. Preflight `phase=complete` and four browser booleans; the five A-E names; the two exported-evidence hashes.
5. Any host restart/interruption and whether resources remain running. No unapproved cleanup.

On failure, return:

1. Exact step/suite and candidate; actual exit or `not recorded`.
2. Failed test name, repository file and line, error code, and safe scalar expected/actual values such as HTTP status or checkpoint count. Do not paste whole assertion bodies, stack traces, logs, provider responses, fixture objects or URLs containing credentials.
3. Preflight phase if generated; actual TAP counts; whether artifact export occurred.
4. Exact owned resource IDs, roles and current states, including partial startup resources. Keep raw inspect output private; do not print environment arrays.
5. Which later suites were not run. Preserve all images, resources and private evidence pending review.

To extract only the safe TAP counters from existing host logs, run this read-only command:

```bash
node --input-type=module <<'COUNTERS'
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {SUITES}=await import(pathToFileURL(process.env.OPS));
for(const name of SUITES){
  try{
    const file=path.join(process.env.EVIDENCE,name+'.log');
    if(!fs.existsSync(file))continue;
    const s=fs.lstatSync(file);
    if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600)throw Error();
    const text=fs.readFileSync(file,'utf8');
    const out={suite:name};
    for(const key of ['tests','pass','fail','cancelled','skipped','todo']){
      const rows=[...text.matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`,'gm'))];
      out[key]=rows.length===1?Number(rows[0][1]):null;
    }
    out.locations=[...new Set([...text.matchAll(/\/work\/((?:tests|lib|app|components)\/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js|ts|tsx)):(\d+):(\d+)/g)].map(m=>`${m[1]}:${m[2]}:${m[3]}`))].slice(0,8);
    out.errorCodes=[...new Set([...text.matchAll(/^\s*code:\s*['"]?([A-Z][A-Z0-9_]{1,47})['"]?\s*$/gm)].map(m=>m[1]))].slice(0,8);
    console.log(JSON.stringify(out));
  }catch{console.log(JSON.stringify({suite:name,diagnostics:'unavailable; original file retained'}));}
}
COUNTERS
```

Null means missing/ambiguous, not zero. Open the failed log locally to identify the failing assertion; return only the safe fields listed above. If you cannot safely extract one field, say `not extracted` and preserve the original. Do not get stuck rewriting the reporter.

For a retained-resource report, run these read-only commands. They list the exact run label, not image ancestors or unrelated resources. A missing row is not proof of a completed disposal.

```bash
[[ -z "${DOCKER_HOST:-}" && -z "${DOCKER_CONTEXT:-}" ]]
[[ "$(docker info --format '{{.ID}}')" == "0c15eeda-6839-43e6-a8ee-585570f98427" ]]
RUN="$(node --input-type=module <<'RUN_ID'
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
try{
  const f=path.join(process.env.PRIVATE,'state.json'),st=fs.lstatSync(f);
  assert.ok(st.isFile()&&!st.isSymbolicLink());assert.equal(st.mode&0o777,0o600);
  const s=JSON.parse(fs.readFileSync(f,'utf8'));
  assert.equal(s.candidate,'25ac040a4d099cad6342aec44863d21aad00f947');
  assert.match(s.runId,/^test-run-[a-f0-9-]{36}$/);
  console.log(s.runId);
}catch{console.error('RUN_ID_UNAVAILABLE: preserve private evidence; no cleanup authorized.');process.exitCode=1;}
RUN_ID
)"
printf 'Owned run: %s\n' "$RUN"
docker container ls --all --no-trunc \
  --filter "label=work.redwan.phase-b=$RUN" \
  --format '{{.ID}} {{.Label "work.redwan.phase-b.role"}} {{.State}} {{.Names}}'
docker network ls --no-trunc \
  --filter "label=work.redwan.phase-b=$RUN" \
  --format '{{.ID}} {{.Name}} {{.Driver}}'
```

If the daemon is unavailable or no private state was created, report that instead of guessing an inventory. Do not restart the daemon or containers to obtain a nicer report.

Keep raw state, material, plans, credentials, headers, cookies, JWTs, signed URLs, provider bodies, fixture manifests, full preflight evidence and raw test logs private. The safe result receipts are not permission to attach the surrounding private directory.

Only when all required checks and original A-E assertions pass may the report say:

`disposable recovery acceptance passed at 25ac040a4d099cad6342aec44863d21aad00f947`

It must still say: **F20 remains failed/deferred; this is not production readiness, independent approval, merge or deployment authority.** Retain the run even on success; disposal is a separate decision.

## Brain's next action after your report

For a confirmed source or test-fixture defect, Brain will investigate the exact failure, add a meaningful regression, make the smallest justified repair, run applicable checks, self-review, push to `fix/audit-followup-remediation`, read back the committed bytes, and verify CI for the resulting SHA. AGY will not be asked to design or patch that repair.

A passing result is recorded as a pass, not an excuse to manufacture a code change. An operator-instruction mistake is distinguished from an application defect. A genuine source change produces a new candidate; this approval and these images do not silently transfer to it.

## Verification and references

This package changes the handoff, not repository source, images, migrations or acceptance assertions. Brain checked the expected scenarios/counts against the pinned test files. The existing executor was previously checked with 30 isolated tests and is included unchanged. The new read-only receipt/diagnostic commands passed 29 private-file fixture checks, including successful-prefix skipping, failed/partial receipt refusal, artifact binding and secret-output exclusion; all 14 Bash blocks and four embedded JavaScript programs passed syntax checks. These are handoff checks, not live Docker, Supabase, storage or Chromium execution.

[PR57](https://github.com/redwan-cse/redwan.work/pull/57) | [Exact tested source candidate](https://github.com/redwan-cse/redwan.work/commit/25ac040a4d099cad6342aec44863d21aad00f947) | [AGY preparation evidence](https://t90182137473.p.clickup-attachments.com/t90182137473/9456c2b1-b764-4cf6-8235-0906c4504d57/agy.txt) | [Original approved execution handoff](https://u260620636.p.clickup-attachments.com/u260620636/3dab0f61-6bb8-56e1-aa5a-3220e312f8e2/AGY-authorized-25ac040-one-shot-start-and-tests.md?view=open)
