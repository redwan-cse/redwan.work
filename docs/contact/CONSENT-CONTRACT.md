# Explicit consent contract

The existing contact UI and field layout are preserved. The actual checked state is serialized as exactly one gdprConsent field with literal true/false. The server accepts only a single literal true before constructing consent_at. Missing, false, alternate truthy spellings, and duplicate fields are refused. This records explicit agreement to the existing Data & Privacy wording, not marketing opt-in or a new policy.

Email diagnostic text is allowlisted. Known fixed operational outcomes and the upstream handoff marker are preserved; arbitrary provider/DB messages become a generic category before logging. Recipient addresses remain in the existing access-controlled email log by design; message bodies, tokens and provider diagnostic payloads are not copied into error fields.

A one-use Actions source edit is confined to the named development branch and exact previously inspected Git blob hashes, using one atomic non-forced ref update. It never targets main, production services or another repository. The job has only repository-content write capability, without production secrets. Dependency installation and tests do not receive its token. After the source commit is inspected, a normal follow-up commit triggers fresh-head tests; the source-edit job is not an acceptance pass.

Remaining boundary: diagnostic sanitation does not create a durable email outbox, prove delivery, or repair the separate mailbox acceptance failure in #48. Broader logging and durable events remain tracked separately.
