# Legacy lookup review

PR #27 is explicitly deferred by the owner. This patch does not change its branch, contact payload cleanup, review discussions or merge state.

The remaining Auth lookup previously used users.length as total when the provider omitted total. A full first page could therefore cause an existing account on the next page to be reported absent. Lookup now continues on full pages without a total, detects repeated IDs/nonprogress and incomplete short pages, and caps work at 500 pages without turning exhaustion into a false not-found. Provider failures produce fixed errors without their diagnostic text.

Compatibility recipient helpers no longer print Auth/DB error messages. Admin enumeration uses ordered keyset pages of 100 and hydration batches of 10, returning no partial recipient set if enumeration fails. The legacy email-origin helper requires the configured HTTPS origin (loopback HTTP for disposable development), refusing credentials, path, query and fragment. It no longer derives destinations from request headers or silently falls back to the production site. Delivery-time authorization remains in the outbox, not replaced by these lookup helpers.

Regression tests cover a target beyond the first full page with missing total, repeated/incomplete provider pages, provider-message redaction and configured-origin validation. The combined real Auth/invitation/expiry/browser/storage tests remain required on the new head. No production accounts, mail, migration, merge or deployment is performed.
