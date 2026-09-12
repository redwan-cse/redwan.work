# Dispatch wakeup

Existing successful CRM action callbacks now wake a bounded durable-outbox drain after the request. Their old transport helpers are inert, so they cannot double-send. A callback/render/runtime failure cannot erase the already-committed database event. A configured external scheduler remains mandatory for retries and DB-only events, especially after crashes or low-traffic periods; per-request wakeups are a latency optimization, not a durable queue.

No provider credentials are injected into CI. When Resend is unconfigured, test application callbacks do not attempt external sends. Unit tests replace only the transport adapter and assert persistence-before-send and fixed failure outcomes. The provider endpoint is fixed HTTPS and cannot be supplied by a caller.
