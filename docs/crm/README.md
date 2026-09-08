# CRM development guide

Current development-branch contracts. Unmerged code is not production behavior. [Historical phase reports](https://github.com/redwan-cse/redwan.work/blob/27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a/docs/crm/README.md) remain available without treating their old checks as current acceptance.

## Accounts and access

Profiles hold current role/activity and a monotonic access-token cutoff. Application guards require verified claims plus a matching current active profile; restrictive RLS policies apply the same live authority to CRM data. Admin onboarding checks both profile and Auth role and does not demote administrators. Deactivation disables the profile before attempting Auth ban; partial failures are reported explicitly. See [account authority](../auth/CURRENT-ACCOUNT-AUTHORITY.md).

## Tickets and files

Tickets share the visible TKT numbering sequence with leads. Client ticket creation validates pending uploads, checks actual stored bytes, then atomically creates ticket, first message, file bindings and request identity. A per-client lock enforces the rolling 24-hour quota. Same-identity/same-payload retries return the same ticket; changed content under that identity is refused.

Reply attachments are shared with the ticket as soon as confirmation succeeds, separately from the reply text. The UI says Shared instead of pretending that local removal deletes an already-shared file. Admins and clients use the same scope/MIME/size/rate-control service, with server-side current-profile checks and a locked 10-file cap. Reply body insertion remains its own transaction. See [submission reliability](RELIABILITY-ACCEPTANCE.md).

## Projects, profiles and billing

Clients have project lists/detail pages with milestone progress and pagination. Name/company editing is available to the client and admin; auth email, role, activation and financial identity are not editable through that form. Admin project pages link to project-scoped invoices and creation. Milestones generate one draft snapshot each under transaction locks; repeats open the original invoice. Financial provenance prevents referenced milestone removal. See [client workflows](CLIENT-WORKFLOWS.md) and [invoices](../invoices/README.md).

## Cleanup and communication

Project purge first verifies a complete recovery ZIP, then records snapshot/deletion jobs and removes the project in one SQL transaction. Financial references refuse purge before source storage is touched. Storage failures retain retry tracking and recovery. Independent age-based archive deletion is removed; archive disposal requires an approved retention policy. See [recoverable cleanup](../r2/RECOVERABLE-CLEANUP.md).

CRM lifecycle events are captured transactionally in email_outbox, not entrusted to floating request promises. The worker persists a rendered envelope and uses stable provider idempotency. Legacy transport is disabled; request callbacks only wake durable processing. A configured scheduler is required for backlog/retries. Supabase credential emails remain Auth-owned. See [durable email](../email/DURABLE-OUTBOX.md).

## Operating boundaries

Client account deletion/erasure and archive disposal are not silently implemented without legal/financial retention decisions. No source change approves production migrations or data deletion. Read the root audit runbook and exact PR evidence, use disposable fixtures, verify backup restoration, review the stacked PRs in dependency order, and obtain explicit release approval before main is changed.
