# Financial detail snapshot and runtime boundary review

Review found that legacy invoice detail still loaded one REST page of items and payments, then recomputed totals from that potentially truncated collection. Migration 0033 adds a service-only scalar-JSON snapshot of both collections in one database snapshot. The detail service uses those same arrays for displayed totals and rows, without a second contents fetch. This is distinct from the already paginated invoice list, which uses exact SQL aggregates.

Interactive detail accepts up to 10000 items and 10000 payment records. Beyond that it refuses the detail operation rather than returning partial history or inaccurate totals. No stored data is removed or newly limited. A paginated/export workflow for invoices above that explicit limit is still a performance follow-up, not claimed implemented. Lists and dashboard summaries remain separate from this detail contract.

Runtime object/string/array/numeric guards now precede financial service access. Null headers, null items, malformed arrays, fractional/overflow positions and null payment payloads return safe failure rather than throwing on property access. Monetary precision and aggregate limits still use existing exact invoice math and database constraints. A remaining payment pre-read diagnostic was changed to fixed copy instead of printing the provider message.

Tests exercise actual service imports with 1007 item/payment arrays and one snapshot call, invalid shapes before database access, foreign-client denial, negative stored amount refusal and diagnostic redaction. Disposable SQL creates 1007 items and 1007 submitted payments and validates exact snapshot completeness. Existing live-style financial browser workflows must also pass on the integrated head.

Migration is forward-only and must precede service deployment. Legacy service list exports still require review before being reused; this change does not claim every historical helper is paginated. No production data, email or database was used. Independent financial approval remains distinct from the implementing assistant's inspection and these tests.
