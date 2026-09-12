# Combined authenticated acceptance

The combined-auth workflow tests this branch's application and all migrations, using the reviewed PR #48 harness pinned to 4e9ca493fd6cdd11a82be742670455b752ca4c95. It copies only auth test scripts into a disposable Actions checkout and removes the second source checkout before building, so TypeScript cannot silently compile two applications. No application code is borrowed from the harness branch.

The job uses actual local Supabase Auth/Postgres, new-format publishable/secret API keys, real Chromium and a disposable SMTP mailbox. The synthetic recovery template is readable by Kong while private configuration/status files remain restricted. Existing tests cover real password login/refresh/logout, profile authority changes, generated-link preview/replay behavior and the exact href extracted from an actual recovery email. Hosted production SMTP, new product screen/browser journeys, full invitation mail and physical object recovery remain separate acceptance requirements.

No remote project is linked and no production configuration is injected. All fixture users/messages are scoped and removed; local containers are always torn down. Build artifacts contain disposable configuration and must never be deployed. A failed combined check is not overridden by the earlier passing isolated branch checks.
