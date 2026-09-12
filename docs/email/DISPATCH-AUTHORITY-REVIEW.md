# Delivery-time authority and provider conflict review

## Confirmed findings

The former worker rechecked only profiles.is_active and skipped address lookup when a frozen retry envelope existed. An active but demoted administrator could therefore still receive queued support content; a project/ticket ownership change could leave a notification addressed to a former owner, and a retry could use a superseded Auth address. This is distinct from whether the linked portal page later denies access: the email already contains private content.

Migration 0029 adds a service-only, lease-bound email_dispatch_recipient function. It requires an unexpired processing lease, current profile activity, matching Auth/profile role, no Auth ban, the intended admin/client audience, existing resource and current client ownership where applicable. A frozen envelope must match the current normalized Auth address. The worker runs this check before rendering and again immediately before dispatch. A denied recipient is suppressed with the existing fixed recipient_unavailable category; database errors defer the event. No payload or idempotency key is rewritten on retry.

Authorization checks cannot recall mail already accepted by the provider or atomically lock an external send together with a database role change. The check is immediately before transport, without holding a database transaction across network I/O. This closes stale queued/retried authority, not that inherent external-delivery race.

The former worker also treated every HTTP 409 as permanent failure. Resend documents concurrent_idempotent_requests as retryable and invalid_idempotent_request as a payload conflict. The worker now reads at most 4096 bytes of the response, recognizes only the exact concurrent category, and retries the unchanged key/envelope. Unknown/malformed/oversized 409 bodies and payload conflicts fail closed; 429/5xx remain retryable within existing limits. Provider redirects are refused. No response message is logged.

Source: https://resend.com/docs/dashboard/emails/idempotency-keys . Unit tests cover transport classification, no-send suppression, frozen addresses, unavailable authorization and two-phase checks. Disposable PostgreSQL tests verify role changes, bans, resource ownership, expired/wrong leases, address changes and RPC privileges. No actual production email or migration is executed.

Apply additive 0029 before enabling the dependent worker in any separately approved rollout. Preserve pending/accepted/suppressed records for review; do not reset the queue or change idempotency keys to bypass a denial. Existing retention-policy and final independent-review gates remain.
