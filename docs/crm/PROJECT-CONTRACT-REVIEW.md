# Final project contract review

The milestone service and SQL now reject invalid types and out-of-range cents. Reviewing its FormData callers revealed that they previously rounded fractional cents and extra decimal places before validation. Both add/update actions now use the same exact decimal parser; conflicting amount/cents inputs, exponent syntax, fractional cents and more than two decimal places are refused. A 10001-value cents sweep and actual server-action tests verify the behavior. No invoice rounding rule was changed.

Archived project edits, milestone mutations and deliverable presigning/confirmation are refused by the corresponding service/SQL paths. Detail UI reflects these limits, with disabled milestone controls and no edit/upload form. Current-admin authorization remains required. A milestone delete now asks for confirmation in the UI; referenced milestones remain protected by SQL foreign keys.

Cleanup dialogs no longer claim all backups are deleted forever. They explain verified recovery retention, project record removal, queued source-file deletion and financial-reference refusal. Archive notices no longer invent a 30-day backup expiry.

The two large source files were edited mechanically against their exact previously inspected Git blobs on the one named development branch. The resulting two-file diff was inspected at commit 5e09b9f020a5e4ad225d06627550e31b847b07a3. The temporary script is now inert and its workflow has read-only permission. No main push, merge, production operation or test-gate bypass occurred. Final-head acceptance is required after retirement.
