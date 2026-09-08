# Disposable template permission repair

The authenticated annotation lookup recovered the previous failure phase: verify local template server content. The fixture initializer runs under umask 077 and creates recovery-ci.html with pathlib.write_text, producing a host-owned mode-0600 file. Kong serves it through a bind mount as a different non-root UID, so the fixture file must be world-readable inside the container to be served. The non-secret template contains only Go placeholders, not actual tokens, emails or API keys.

The preflight changes only that synthetic HTML fixture to 0644, verifies the configured container/port/path, reads the template through Kong, requires byte-for-byte equality, then restarts only the disposable Auth service before fixtures are created. Private status/config/log files retain their original restrictive permissions. The check emits only a permission boolean and numeric HTTP status on failure, never environment values or URLs.

The mailbox test itself is unchanged: actual delivered HTML, exact extracted href, expected app origin/path/token type, preview non-consumption, intentional password reset and replay denial remain required. This fixture repair is not a claim about hosted production SMTP/template configuration. Latest-head acceptance must pass before the failure is considered resolved.
