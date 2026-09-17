# Approved bounded CAS and T01 batch

Owner approved12 September2026: diagnose latest disposable acceptance failure; fix acknowledgement counting and cursor conflict reporting; implement proposed50-message live keyset thread pagination; rerun isolated tests. Already-completed acknowledgements are skipped, not completed; lost cursor updates return retryable failure. No ABA/schema/index changes, consent-policy work, production calls or merge. Main auto-deploy remains excluded.

Start:03495e6cb13a2826aca0ab8bbd9463fdcf289425, application unchanged since008569b28ed516663ac8d56f8f32de1d5cd4f1fd. Shared tracker PR56.

Audit reproduction run34665681714: two actual drain invocations reported2 completions for1 real PostgreSQL acknowledgement; actual route calls returned200 despite3 zero-row cursor updates. Synthetic storage and fluent-client adapter, not real PostgREST/R2. ABA separately reproduced using PostgreSQL statements. Cleanup and container teardown confirmed. Reproduction green is not repaired application acceptance.

Combined run34665681736 failure: Auth/recovery passed; product/lifecycle step failed in disposable storage setup/runner; subsequent wave matrix skipped. Outer Destroy disposable services succeeded. The wave reporter's cleanup=False is missing-matrix evidence, not proof of a teardown failure. Fixed-category startup diagnostics added before any fixture modification.

T01 approved design:50 visible messages,51-row lookahead; keyset(created_at,id), latest first query and chronological display; validated versioned/ticket-bound cursor preserving PostgreSQL timestamp precision; Older/Newer/Latest links; role/ownership rechecked per page; malformed cursor denied, unavailable service retryable rather than404. Reply success from history goes to Latest, failed reply retains draft/history. Attachments stay ticket-wide with current bounded/sharing behavior. Live traversal is not a frozen snapshot; late-committing/backdated rows may require Latest refresh. No migration or latency guarantee. Implementation and exact-head verification pending.
