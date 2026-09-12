# Product browser acceptance

The disposable Chromium suite tests the built application, not a UI mock: client project/milestone progress, profile edits verified in Postgres, a mobile overflow check, foreign-project 404, milestone draft creation and same-invoice retry, client draft isolation, and a quantity-1.001 invoice saved through the real form and verified in the database.

Random example.test users and one synthetic project are created in the job-local Supabase stack. Browser requests are restricted to application/Auth loopback origins. Exact invoice/provenance/project/users are removed and profile count must be zero. Raw output, tokens, addresses and credentials are not published. This suite does not perform real R2 uploads, send real mail, or authorize any production fixture operation.

The test runner is invoked after the combined Auth/mailbox harness has built the current application. A browser failure is a release blocker, not waived by the separate SQL/validator tests.
