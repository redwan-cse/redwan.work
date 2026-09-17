# Download response contract

An anonymous/invalidly authenticated request returns 401. A cryptographically verified identity rejected by current-profile authority returns the same generic 404 as an unauthorized/foreign file, preserving the original audit-runbook deactivation contract. It does not perform file lookup or signing in that denied-session path. A successful owned download remains a 302 to the short-lived storage URL. All outcomes are no-store.

The second claims check distinguishes authenticated denial from anonymity only; it never grants file access. Ownership and current active role are still required by getCurrentSession and the file service. Focused route tests verify 401/404 distinction, no denied-session storage lookup, fixed error copy and noncacheable redirects. PR #48's old isolated file tests documented the interim 401 behavior; the final integrated branch supersedes that compatibility note with this explicit contract.
