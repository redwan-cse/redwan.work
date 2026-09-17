# New invoice project-choice pagination

The global new-invoice page previously loaded every project through full CRM hydration, including milestone/file counts and Auth email lookups that the selector did not need. It now requires a current admin, queries active non-archived projects only, joins display names in one request and selects at most 25 choices. Name search escapes LIKE wildcards so input is treated as a literal substring. Exact count drives navigation; query failure or missing count does not become an empty success.

Project-scoped invoice creation is unchanged and remains the simplest path when the project is already known. Global search/pagination occurs before entering invoice details, with explicit UI notice that navigation starts a new form. Existing draft-editor project-choice behavior is a separate remaining legacy path and is not claimed fixed by this patch.

Tests verify the guard, range, active/archive filters, wildcard treatment and generic errors. This is branch-only development with no invoice creation, migration or production data access performed by tools.
