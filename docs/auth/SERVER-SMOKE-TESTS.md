# Credential-free production server smoke tests

After `npm ci && npm run build`, run:

```sh
node --test tests/server/*.test.mjs
```

The GitHub Actions `Quality / build` job now requires both a successful build and these tests. They start the real built Next.js server on loopback, exercise HTTP routing and stop only that spawned process. They reject local/production env files and allowlist process environment plumbing instead of inheriting app credentials. Only readiness is retried, within a deadline; assertion failures are not retried or suppressed.

Coverage: public homepage/header smoke checks; protected admin/client redirects with the intended destination; reachable auth screens; generic unauthenticated file-download rejection; unauthorized retention rejection before any cleanup. All requests stay on loopback and do not follow redirects. The retention request carries no credentials and cannot reach the cleanup path.

This tests missing-configuration fail-closed behavior, not an authenticated session. It does not verify browser hydration, real JWT verification, Auth refresh, invitation delivery, RLS, R2, account changes or production headers. Those remain separate gates. No production data or credentials are used. The build artifact has synthetic site configuration and must not be deployed.

The AI security-check failure on earlier head 035ed06 was explained by owner-provided logs: the GitHub-managed scanner requested an unsupported model and received HTTP 400 before its review could execute. This is an unavailable AI review, not a detected application vulnerability and not a passing scan. Do not disable the gate or claim it has been resolved; retry/provider follow-up remains separate.
