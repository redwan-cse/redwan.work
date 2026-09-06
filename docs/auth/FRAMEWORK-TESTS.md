# Session and proxy framework regression tests

PR #48 adds a real-framework test layer alongside fast adapter-mocked unit tests. Run on Node 22.23.1 after `npm ci`:

```sh
node --experimental-strip-types --test tests/*.test.mjs
node --experimental-strip-types --test tests/framework/*.test.mjs
```

GitHub Actions runs these separately as `Quality / unit` and `Quality / framework`. Lint, types, build and dependency audit remain independent jobs. PR events run the candidate checks; main pushes run the merged baseline. Feature-branch push duplication has been removed. No production credentials or integration secrets are referenced by this workflow.

## Real versus simulated

The framework suite imports the repository's actual proxy, session reader and file-download handler. It uses the locked Next.js package's real NextRequest, NextResponse, RequestCookies/ResponseCookies behavior, middleware request-header serialization, JSON bodies, redirect statuses and Set-Cookie headers. It uses the actual Supabase SSR cookie parser.

Supabase identity/profile responses and the storage authorization adapter remain test doubles. The suite blocks fetch, uses synthetic example.test identities/URLs, and changes no live data. It does not run the Next server/router, a browser, real JWT verification, Supabase Auth, RLS or R2. Those are separate integration/release gates and must not be checked off from this suite.

## Coverage

- Active admin/client routing and both changed-role directions.
- Anonymous, inactive and missing-authority outcomes; login remains reachable without a stale-session loop.
- Repeated chunked cookie writes, replacement and deletion, preserving unrelated request cookies.
- Downstream cookie header overrides, browser Set-Cookie serialization, path/max-age/HttpOnly/SameSite/production Secure attributes.
- Redirect preservation of session cookies and cache-control/pragma/expires/vary, without forwarding middleware continuation headers onto redirects.
- Generic non-cacheable dependency-error responses; missing configuration; recovery/invitation routing.
- Actual file route JSON and redirect responses, with session checks intact and storage replaced.

## Endpoint compatibility: current PR behavior

The file-download route returns 401 when `getCurrentSession()` rejects the session, including inactive/mismatched-profile sessions. An accepted session whose file access is denied receives generic 404. An allowed file produces 302 without fetching the download target. Proxy dependency failures produce generic 503/no-store; protected unauthenticated routes redirect 307 to login with the intended destination.

The historical deactivated-client download probe expected 404. Current centralized session rejection selects the pre-existing route's 401 branch instead. This suite records the difference explicitly; it does not declare the historical probe satisfied or silently redefine its acceptance criteria. Review the intended public contract and reconcile it before merge.

## Completion and safety

A passing framework job proves only these framework contracts at that commit. Real refresh-token/JWT behavior, browser login/recovery/invitation/logout and database policy verification remain open. Required branch checks are not configured by this file. No audit issue is closed by this test addition.

No app implementation or migration change is part of this test slice. Test/workflow changes can be reverted independently. Reverting the earlier session-authority implementation would restore its previous behavior and is not a security remediation; coordinate any deployment rollback with the owner. Main pushes/merges and production mutations still need explicit approval.
