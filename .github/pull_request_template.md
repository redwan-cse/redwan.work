## Scope and acceptance criteria
- Approved story / audit IDs:
- In scope:
- Explicitly deferred:

## Evidence for this exact checkout
- Head commit and tested tree / PR merge checkout:
- Failing regression before fix:
- Passing tests after fix and CI links:
- Unit, SQL/RLS, E2E, accessibility, SEO receipts:
- Anonymous / client A / client B / inactive / admin AAL1 / admin AAL2 checks:
- Responsive viewports, browsers, keyboard and reduced-motion results:
- Public identity/content provenance changes:

## Data and operations
- New migration(s); existing applied migration bytes unchanged:
- Disposable test environment and cleanup proof:
- Rollback; protected backup and isolated-restore evidence if live data is affected:
- Provider/config/scheduler changes required (not performed by this PR):
- No real mail, live uploads/deletions, or production credentials used:

## Review and release boundary
- Independent semantic reviewer and unresolved findings:
- Documentation updated:
- Known limitations / untested behavior:
- [ ] I did not replace missing tests with skipped checks or fake receipts.
- [ ] I did not weaken required gates or use production endpoints as health probes.
- [ ] This PR does not authorize a production merge, deployment, migration, or scheduler activation.
