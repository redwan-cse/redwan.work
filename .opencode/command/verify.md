---
description: Lint, type-check, and build the project, then summarize results
agent: build
---

Run the full verification suite for this repo in order:

1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build`

Report: pass/fail per step, then all errors/warnings with file paths and suggested fixes. If everything passes, say so plainly. Do not attempt fixes unless I ask.

$ARGUMENTS
