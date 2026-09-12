# Email outbox operations

The application viewer is /admin/emails/outbox, linked from the existing attempt history. It exposes event class, state, attempts and fixed diagnostics, never rendered envelopes or private bodies. Access requires a current active admin. Pages are bounded at 25 rows.

The bearer-gated /api/cron/email-outbox endpoint processes up to three events. Production scheduler activation is a required, separately approved deployment step. Do not enable the outbox-dependent application while leaving processing unscheduled. Configure a cadence within the actual hosting plan that satisfies the team's delivery-latency requirement; neither plan access nor that latency requirement is available to this development environment. No hidden paid-plan cron schedule is added. Event persistence itself is safe without a running worker, but delivery is not complete until dispatch is operating.

Provider idempotency documentation: https://resend.com/docs/dashboard/emails/idempotency-keys . Keys expire after 24 hours, so automatic retries stop before that horizon. A 409 may mean an in-progress concurrent request or changed payload; investigate the fixed outbox state and provider dashboard before retrying outside the horizon. This implementation never prints provider response bodies. No endpoint accepts a user-supplied provider URL.

Rollback: retain outbox/audit rows; stop dispatch, inspect pending/processing/accepted states, and reconcile provider IDs before changing transports. Do not re-enable legacy sends alongside the outbox. Credential-bearing Supabase invitations/recovery remain Auth-owned and require their separate mailbox acceptance. External Auth request audit is currently best-effort and is not misrepresented as transactional with the upstream provider.
