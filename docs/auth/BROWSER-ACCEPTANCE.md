# Real browser acceptance: PR #48

The `Browser / Chromium` Actions job builds and launches the actual Next.js application and drives real headless Chromium at desktop 1280x900 and mobile 390x844 viewports. Neither Next.js routing nor React rendering is mocked.

## Run

Install application dependencies with `npm ci` and build with synthetic `NEXT_PUBLIC_SITE_URL=https://example.test` and no integration credentials. Install the exact test-only tool version outside the repository:

```sh
npm install --prefix /tmp/redwan-browser-tools --ignore-scripts --no-audit --no-fund --save-exact playwright@1.58.2
node /tmp/redwan-browser-tools/node_modules/playwright/cli.js install --with-deps chromium
BROWSER_TOOLS_DIR=/tmp/redwan-browser-tools node --test tests/browser/*.test.mjs
```

The workflow installs browser tooling in runner temporary storage, without changing the application manifest or lockfile. Playwright is version-pinned; this temporary tool dependency installation is not a committed independent lockfile and must not be described as fully lockfile-reproducible. Application dependencies continue to use npm ci. The version and test output are visible in Actions; the final step includes available TAP output in the run summary even when tests fail.

## Verified by these scenarios when CI passes

Protected admin/portal URLs land on login with the destination retained; React hydrates sufficiently to switch between password and recovery forms; the destination survives those switches; email/password labels and keyboard navigation work; empty/malformed email submissions trigger native browser validation without invoking server actions; login does not horizontally overflow at either viewport; missing-token recovery and invite screens show their invalid-link states; uncaught browser exceptions fail the test.

The browser blocks requests outside loopback. The spawned production-mode server inherits only process plumbing plus synthetic configuration. The suite refuses local/production env files, creates no accounts and sends no email. Each viewport uses a fresh browser context. Only readiness is polled; failed assertions are not retried.

## Remaining acceptance

These are unauthenticated/missing-configuration scenarios, NOT successful login, real Supabase JWT/refresh, deactivation/demotion through the Auth service, mailbox delivery or database/RLS verification. Missing-token screens are tested, not valid credential-bearing invitation/recovery links. Full accessibility and all browser engines are also not claimed. Real Auth/staging acceptance and the documented download 401/404 contract review remain open. GitHub-managed AI-review availability is separate from browser-test success.
