# Bounded maintenance progress

Retention now reads at most 100 R2 objects from each namespace and 10 archived project candidates per invocation. The service records lexicographic StartAfter positions in a service-only cursor table and wraps at the end. Protected objects/projects no longer monopolize the first page forever. Concurrent workers may repeat a page, but per-key tombstones and idempotent deletion make repetition safe; compare-and-set cursor updates prevent stale workers from overriding advanced progress.

Each R2 page must have valid ordered keys and timestamps. Missing metadata, foreign keys, empty truncated pages or nonprogressing keys fail closed. SQL claims query complete reference sets and serialize with new reference triggers, so paging never authorizes deletion from a partial REST reference inventory. Late insertions behind the current cursor are considered on the next cycle. Object inventories no longer accumulate the entire bucket in memory.

Recovery ZIPs remain preserved pending an owner-approved disposal policy. Physical deletion jobs are separately bounded at 100 keys per drain. The queued project snapshot retains all database metadata even after a failed storage deletion. Tests cover page advancement/wrap and malformed/nonprogressing responses; actual Cloudflare R2 lifecycle/restore acceptance remains distinct.
