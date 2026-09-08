# Purge connection evidence

Commit c21cf7cce05cf7b7183c8f4a0dc1be7014caa323 was inspected: only lib/crm/projects.ts changed, replacing its unsafe purge body with delegation to the recovery service and removing the now-unused deletion import. The temporary connector and earlier consent editor are now inert stubs; their workflows have no contents-write permission.

Fresh-head tests cover invoice refusal before storage, unavailable recovery refusing database preparation, already-prepared retries, and deletion failures preserving pending tracking. SQL acceptance covers references beyond 1000 rows, late rebinding refusal, financial/stale-snapshot refusal and atomic recovery records. No old check is counted as a fresh-head pass.
