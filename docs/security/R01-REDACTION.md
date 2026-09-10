# R01: reachable error redaction

Approved by owner10 September2026, following the exact-source entry-point trace on7ea2a7fff0ed6a17283a947ff9c36ec9c5d87da3. Single tracker remains PR56 and original audit issues; no automatic issue closure.

Scope: public contact presign database/provider/signing catches and adjacent untrusted origin/host/provider-code logs; Blogger fetch catch; admin email-log query-error truncation; authenticated revalidation exception response. Replace arbitrary diagnostic payloads with fixed categories, keep public statuses/messages, authorization, rate/replay rules, upload validation, pagination and cache behavior otherwise unchanged. No schema, production, retention, consent-version, post-OTP, historical-row rewrite or merge.

Trace: /contact -> enhanced-contact-form -> POST /api/uploads/presign -> RPC/siteverify/signing catches; /blogs -> getBlogPostsPage -> fetchBlogPostsPage; /admin/emails -> listEmailLogs; bearer-protected POST /api/revalidate -> revalidatePath/cache clear. Public request access to a logging sink is not public access to server logs. No observed production secret disclosure claimed.

Test-first suite tests/r01-redaction.mjs imports actual route/service modules with explicit synthetic Next/storage/Supabase/Google adapters. It asserts response status, no signing on denial, pre-bot rate failure, sentinel-free console and returned errors, and successful/range/count/cache/auth-denial controls. Network-disabled container; no actual provider/SQL/browser acceptance claim. Node and locked dependencies from CI. Test results will be recorded in PR56 with exact heads/runs. Initial commit is tests only; implementation and verification pending.

Browser error-boundary sanitization, historical email_log.error display and broader source inventory are separate unverified concerns, not silently changed by this four-sink repair. No raw errors, tokens, mail contents or customer rows published. Self-review only, independent approval absent, not deployed.
