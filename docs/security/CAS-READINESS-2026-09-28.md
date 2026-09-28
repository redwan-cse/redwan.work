# CAS disposable PostgreSQL readiness repair

28 September 2026. Existing tracker: [PR57](https://github.com/redwan-cse/redwan.work/pull/57), branch `fix/audit-followup-remediation`. This is a CI setup repair, not a change to the application's compare-and-swap contract or a release authorization.

## Failure and cause

At `e5981773c0dabaa728e0403cf2b94135ed362cd6`, [the failing CAS job](https://github.com/redwan-cse/redwan.work/actions/runs/36347502855/job/108699544048) reports `CAS category=database-not-ready line=5`. All result flags were false, starting at setup. That line is the Docker/psql transport used for initial fixture SQL. The race assertions had not passed; this was not evidence that acknowledgement or cursor CAS semantics had regressed.

The old workflow treated a successful Unix-socket `pg_isready` as final readiness. The official PostgreSQL image first starts a socket-only temporary server, creates the database, stops that server, and then starts the final server. Its [entrypoint](https://github.com/docker-library/postgres/blob/d588a44673ea9d123c1acb1a6924de10a27fc315/docker-entrypoint.sh) explicitly sets `listen_addresses=''` for initialization and performs `docker_temp_server_stop` before the final `exec`. The old guard therefore admits the initialization/shutdown window. No raw provider responses or production data were needed to reproduce this boundary.

## Repair

Startup now requires an actual `SELECT 1` against `audit_cas` over `127.0.0.1` **inside the network-isolated container**, with successful exit and exactly the expected scalar. A temporary socket listener, missing database, rejected SQL, or misleading output cannot release the test.

The existing 60 condition probes remain bounded. Each probe has a two-second PostgreSQL connection timeout and a three-second process timeout with a one-second forced-stop grace. No password prompt or psql startup file is allowed. Only the read-only readiness query is retried. Fixture creation, application operations, race assertions and cleanup are never retried to conceal failures.

The container still uses `--network none`, no published ports, and synthetic test data only. The actual CAS harness, both application modules, migrations, conflict responses, acknowledgement counts, ABA observation, teardown and finite status criteria are unchanged. The unchanged CAS harness has Git blob `0d20a60635b4e72d51c4984c113e4306c88fe1b0`.

## Verification

`node --test tests/reliability/audit-cas-readiness.test.mjs` executes the actual workflow startup shell with a deterministic Docker command double and real Bash/process timeouts. It exercises temporary-server readiness followed by shutdown and final startup, immediate real-query readiness, missing database, incorrect SQL output, failed SQL even with output `1`, persistent unavailability, and a hung command. It verifies network isolation, finite probe counts and non-disclosure of synthetic private diagnostics.

Against the byte-matched old workflow, the initial seven-case run produced one pass and six failures, including `Startup released CAS against the temporary init server`. After repair all seven passed, with no skipped, cancelled or todo cases. The fixture's outer process-group timeout also ensures intentionally hung doubles are cleaned up when testing an older workflow.

These local tests model Docker/PostgreSQL responses; they are not a local real-database run. The sandbox has no Docker/PostgreSQL executable or internet access. The same regressions run directly in the CAS job before its existing real PostgreSQL/application-module integration, and in the reliability suite. Integration acceptance must come from the revised exact commit's `audit/cas-reproduction` status and `reproduce` job, not from the local model or a previous green commit.

## Boundaries

Review is self-review, not independent approval. The CAS harness still records the known last-key ABA limitation; this repair does not claim to remove it or make retention safe for unapproved production activation. F20 consent-version source integration is separate and its historical development/rollout evidence remains in the contact documentation and commit history.

AGY remains on hold. No production operation, scheduler activation, real mail, policy activation, historical backfill, main push, merge, deployment, startup, disposal or replay of an old operator package is part of this repair. Original browser scenario C and subsequent C/D/E live acceptance remain separate.
