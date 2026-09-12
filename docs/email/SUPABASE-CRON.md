# Supabase Cron for the Resend outbox

Owner-approved implementation: Supabase Cron every five minutes, existing bearer-gated GET /api/cron/email-outbox, credential in Supabase Vault. Vercel is Hobby, so its daily-only built-in Cron is not used for outbox retries. Resend remains the sender; Supabase Cron only wakes the existing durable worker. No Edge Function or new mail transport is introduced.

## Installer and activation boundary

supabase/operations/install_email_outbox_cron.sql is an explicit operator script, NOT an automatically applied migration. It enables pg_cron, pg_net and supabase_vault, creates a restricted app_scheduler function and installs one named five-minute job INACTIVE. Reinstallation leaves the existing matching job inactive and refuses conflicting commands. There are no network calls during installation. No scheduler, secret or extension has been installed in production by this change.

After production backup/restore, schema/app checks and separate activation approval, an authorized database operator can install the script. Populate a Vault secret named redwan_email_outbox_cron_secret with the same strong credential configured as CRON_SECRET on the app, using the dashboard/approved secret provisioning, not committed SQL or public logs. Resend API credentials remain in the app's server environment, never in the cron command. The dispatcher refuses missing, duplicate, short or whitespace-bearing credentials with fixed error copy.

The only production target is https://redwan.work/api/cron/email-outbox. No user-configurable destination, query credential, arbitrary URL or redirect migration is used. Ensure this exact endpoint does not redirect and hosted pg_net networking is allowed before activation. The cron command contains only a function call, not the decrypted secret. Deny application roles access to Vault, cron internals and pg_net request queues because queued Authorization headers are sensitive. Privileged operators can access those internals; Vault does not make a decrypted outbound header invisible to database administrators.

With separate approval, activate the named job via cron.alter_job using its resolved jobid and active:=true. Pause using active:=false before maintenance, restoring backups into a reachable environment, endpoint changes or secret rotation. Disable recreated jobs in restored/branched databases to prevent duplicate or unintended production calls. Rotate the app credential and Vault value together, then verify authenticated requests without printing either value. Reinstalling the script intentionally pauses an active job; it is an operational action, not a harmless read.

## Delivery and monitoring

pg_net HTTP request enqueue success and cron job success do NOT prove HTTP success or mail delivery. Monitor net._http_response status/errors using request IDs, cron run history, and the app's outbox backlog/failed counts; never export response payloads or auth headers. 401 indicates configuration/authentication mismatch; 503 indicates failed/deferred work and needs investigation. Subsequent five-minute ticks revisit due events through the existing fenced/idempotent worker. Do not blindly add immediate HTTP retries.

The existing worker drains at most three events per call: schedule-only capacity is at most 36 attempted events/hour (864/day), before failures/provider limits; request wakeups may add throughput. Five-minute cadence is not a guaranteed five-minute delivery SLA. Monitor oldest pending age and alert well before the existing 23-hour retry horizon. Cron outages, paused Supabase projects, quotas, HTTP timeouts and Hobby function limits can delay processing. Resend acceptance still does not prove inbox delivery.

## Disposable evidence

The local reliability suite installs actual pg_cron, pg_net and Vault in its fresh disposable Supabase database. Its test-only copy changes the one fixed destination to a host fixture restricted to the database container IP, with a random synthetic credential held only in memory. It verifies inactive five-minute installation, missing/invalid credential refusal, denied application-role execution, actual authenticated GET through pg_net, accelerated actual Cron execution and inactive singular reinstall. It removes only its job and Vault secret; stack teardown destroys all remaining internal queue state. Production URL and Resend are not called.

This validates scheduler transport against a fixture, not real production dispatch or Resend delivery. Existing outbox runtime/SQL/browser tests independently cover application authentication, transaction persistence, leasing, retry and transport behavior. Production activation stays pending separate approval and hosted verification.

References: https://supabase.com/docs/guides/cron ; https://supabase.com/docs/guides/database/extensions/pg_net ; https://supabase.com/docs/guides/functions/schedule-functions ; https://supabase.com/docs/guides/database/vault .
