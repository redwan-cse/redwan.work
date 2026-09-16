import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {NextRequest} from 'next/server.js';

// Synthetic state store for outbox tests
const state = {
  events: [],
  outcomes: [],
  savedEnvelopes: [],
  recipient: 'synthetic@example.test',
  recipientError: null,
  envelopeUpdateFail: false,
  envelopeUpdateError: null,
  finishSuccess: true,
  finishError: null,
  recipientChecks: 0,
  claimError: null,
};
globalThis.__outboxLifecycleTest = state;

const modules = {
  'server-only': 'export {};',
  '@/lib/supabase/admin': `export function getSupabaseAdmin() {
    const s = globalThis.__outboxLifecycleTest;
    return {
      rpc: async (name, args) => {
        if (name === 'claim_email_event') {
          if (s.claimError) return { data: null, error: s.claimError };
          return { data: s.events.splice(0, 1), error: null };
        }
        if (name === 'email_dispatch_recipient') {
          s.recipientChecks++;
          if (s.recipientError) return { data: null, error: s.recipientError };
          const val = typeof s.recipient === 'function' ? s.recipient(s.recipientChecks) : s.recipient;
          return { data: val, error: null };
        }
        if (name === 'finish_email_event') {
          s.outcomes.push(args);
          if (s.finishError) return { data: null, error: s.finishError };
          return { data: s.finishSuccess, error: null };
        }
        return { data: null, error: null };
      },
      from: (table) => {
        const query = {
          select: () => query,
          eq: () => query,
          update: (val) => {
            s.savedEnvelopes.push(val);
            return query;
          },
          maybeSingle: async () => {
            if (s.envelopeUpdateFail) return { data: null, error: null };
            if (s.envelopeUpdateError) return { data: null, error: s.envelopeUpdateError };
            return { data: { id: 'synthetic-saved' }, error: null };
          },
        };
        return query;
      },
    };
  }`,
};

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(modules, specifier)) {
      return {
        url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]),
        shortCircuit: true,
      };
    }
    if (specifier === '@/lib/email/templates') {
      return {
        url: new URL('../../lib/email/templates.ts', import.meta.url).href,
        shortCircuit: true,
      };
    }
    if (specifier === '@/lib/email/outbox') {
      return {
        url: new URL('../../lib/email/outbox.ts', import.meta.url).href,
        shortCircuit: true,
      };
    }
    if (specifier === '@/lib/auth/bearer') {
      return {
        url: new URL('../../lib/auth/bearer.ts', import.meta.url).href,
        shortCircuit: true,
      };
    }
    if (specifier === 'next/server') {
      return nextResolve('next/server.js', context);
    }
    return nextResolve(specifier, context);
  },
});

const {drainEmailOutbox, renderOutboxEvent} = await import('../../lib/email/outbox.ts');
const {GET: cronHandler} = await import('../../app/api/cron/email-outbox/route.ts');
const {sendEmail, isEmailConfigured} = await import('../../lib/email/index.ts');
hooks.deregister();

const originalFetch = globalThis.fetch;
test.after(() => {
  globalThis.fetch = originalFetch;
});

function resetState() {
  state.events = [];
  state.outcomes = [];
  state.savedEnvelopes = [];
  state.recipient = 'synthetic@example.test';
  state.recipientError = null;
  state.envelopeUpdateFail = false;
  state.envelopeUpdateError = null;
  state.finishSuccess = true;
  state.finishError = null;
  state.recipientChecks = 0;
  state.claimError = null;

  process.env.NEXT_PUBLIC_SITE_URL = 'https://redwan.work';
  process.env.RESEND_API_KEY = 're_synthetic_key_12345';
  process.env.RESEND_FROM_EMAIL = 'no-reply@redwan.work';
}

function createSyntheticEvent(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    template: 'new-ticket',
    entity_id: '22222222-2222-4222-8222-222222222222',
    recipient_id: '33333333-3333-4333-8333-333333333333',
    lease_token: 'synthetic-lease-token',
    payload: {ticketNumber: 101, subject: 'Issue with billing'},
    envelope: null,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 1. Template Rendering Matrix (renderOutboxEvent)
// -----------------------------------------------------------------------------
test('template rendering: new-ticket produces expected subject and links', () => {
  const event = createSyntheticEvent({
    template: 'new-ticket',
    entity_id: 'ticket-uuid-1',
    payload: {ticketNumber: 42, subject: 'Need migration assistance'},
  });
  const rendered = renderOutboxEvent(event, 'https://redwan.work');
  assert.match(rendered.subject, /#TKT-42/);
  assert.match(rendered.subject, /Need migration assistance/);
  assert.match(rendered.html, /https:\/\/redwan\.work\/admin\/tickets\/ticket-uuid-1/);
});

test('template rendering: reply-posted formats for admin and client audiences', () => {
  const adminReplyEvent = createSyntheticEvent({
    template: 'reply-posted',
    entity_id: 'ticket-uuid-2',
    payload: {
      ticketNumber: 105,
      subject: 'Clarification',
      authorName: 'John Client',
      bodyPreview: 'Here are the details requested...',
      adminAudience: true,
    },
  });
  const adminRendered = renderOutboxEvent(adminReplyEvent, 'https://redwan.work');
  assert.match(adminRendered.subject, /#TKT-105/);
  assert.match(adminRendered.html, /https:\/\/redwan\.work\/admin\/tickets\/ticket-uuid-2/);

  const clientReplyEvent = createSyntheticEvent({
    template: 'reply-posted',
    entity_id: 'ticket-uuid-2',
    payload: {
      ticketNumber: 105,
      subject: 'Clarification',
      authorName: 'Support',
      bodyPreview: 'We have updated your status.',
      adminAudience: false,
    },
  });
  const clientRendered = renderOutboxEvent(clientReplyEvent, 'https://redwan.work');
  assert.match(clientRendered.subject, /#TKT-105/);
  assert.match(clientRendered.html, /https:\/\/redwan\.work\/portal\/tickets\/ticket-uuid-2/);
});

test('template rendering: status-changed formats status and portal link', () => {
  const event = createSyntheticEvent({
    template: 'status-changed',
    entity_id: 'ticket-uuid-3',
    payload: {ticketNumber: 204, subject: 'Bug fix', status: 'resolved'},
  });
  const rendered = renderOutboxEvent(event, 'https://redwan.work');
  assert.match(rendered.subject, /#TKT-204/);
  assert.match(rendered.html, /resolved/);
  assert.match(rendered.html, /https:\/\/redwan\.work\/portal\/tickets\/ticket-uuid-3/);
});

test('template rendering: deliverable-uploaded formats project and portal files link', () => {
  const event = createSyntheticEvent({
    template: 'deliverable-uploaded',
    entity_id: 'file-uuid-4',
    payload: {projectName: 'Design System', filename: 'assets-v1.zip'},
  });
  const rendered = renderOutboxEvent(event, 'https://redwan.work');
  assert.match(rendered.subject, /New file in Design System/);
  assert.match(rendered.html, /assets-v1\.zip/);
  assert.match(rendered.html, /https:\/\/redwan\.work\/portal\/files/);
});

test('template rendering: invoice-issued formats money and due date', () => {
  const event = createSyntheticEvent({
    template: 'invoice-issued',
    entity_id: 'inv-uuid-5',
    payload: {
      invoiceNumber: 1001,
      amountCents: 500000,
      currency: 'USD',
      dueLabel: '2026-10-01',
    },
  });
  const rendered = renderOutboxEvent(event, 'https://redwan.work');
  assert.match(rendered.subject, /#INV-1001/);
  assert.match(rendered.html, /\$5,000\.00/);
  assert.match(rendered.html, /2026-10-01/);
  assert.match(rendered.html, /https:\/\/redwan\.work\/portal\/invoices\/inv-uuid-5/);
});

test('template rendering: payment-confirmed formats received and outstanding amounts', () => {
  const eventWithBalance = createSyntheticEvent({
    template: 'payment-confirmed',
    entity_id: 'inv-uuid-6',
    payload: {
      invoiceNumber: 1002,
      amountCents: 250000,
      outstandingCents: 250000,
      currency: 'USD',
    },
  });
  const renderedBalance = renderOutboxEvent(eventWithBalance, 'https://redwan.work');
  assert.match(renderedBalance.subject, /Payment confirmed — invoice #INV-1002/);
  assert.match(renderedBalance.html, /\$2,500\.00/);

  const eventFull = createSyntheticEvent({
    template: 'payment-confirmed',
    entity_id: 'inv-uuid-6',
    payload: {
      invoiceNumber: 1002,
      amountCents: 500000,
      outstandingCents: 0,
      currency: 'USD',
    },
  });
  const renderedFull = renderOutboxEvent(eventFull, 'https://redwan.work');
  assert.match(renderedFull.subject, /Payment confirmed — invoice #INV-1002/);
});

test('template rendering: rejects invalid numbers, currencies, or unknown templates', () => {
  assert.throws(
    () =>
      renderOutboxEvent(
        createSyntheticEvent({
          template: 'invoice-issued',
          payload: {invoiceNumber: 1, amountCents: -50, currency: 'USD'},
        }),
        'https://redwan.work'
      ),
    /Invalid event amount/
  );

  assert.throws(
    () =>
      renderOutboxEvent(
        createSyntheticEvent({
          template: 'invoice-issued',
          payload: {invoiceNumber: 1, amountCents: 1000, currency: 'usd'},
        }),
        'https://redwan.work'
      ),
    /Invalid currency/
  );

  assert.throws(
    () =>
      renderOutboxEvent(
        createSyntheticEvent({template: 'unsupported-template', payload: {}}),
        'https://redwan.work'
      ),
    /Unsupported event/
  );
});

// -----------------------------------------------------------------------------
// 2. Origin Strictness & Site URL Validation
// -----------------------------------------------------------------------------
test('origin validation: accepts clean HTTPS origin and rejects malformed site URLs', async () => {
  resetState();
  state.events = [createSyntheticEvent()];

  // Loopback HTTP is allowed for testing/development
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  globalThis.fetch = async () => new Response(JSON.stringify({id: 're_synthetic_1'}));
  assert.deepEqual(await drainEmailOutbox(1), {accepted: 1, deferred: 0, failed: 0});

  // Rejects URL with trailing subpath
  resetState();
  state.events = [createSyntheticEvent()];
  process.env.NEXT_PUBLIC_SITE_URL = 'https://redwan.work/subpath';
  assert.deepEqual(await drainEmailOutbox(1), {accepted: 0, deferred: 1, failed: 0});
  assert.equal(state.outcomes[0].p_error, 'render_failed');

  // Rejects URL with query string
  resetState();
  state.events = [createSyntheticEvent()];
  process.env.NEXT_PUBLIC_SITE_URL = 'https://redwan.work?query=test';
  assert.deepEqual(await drainEmailOutbox(1), {accepted: 0, deferred: 1, failed: 0});
  assert.equal(state.outcomes[0].p_error, 'render_failed');

  // Rejects non-local HTTP
  resetState();
  state.events = [createSyntheticEvent()];
  process.env.NEXT_PUBLIC_SITE_URL = 'http://example.com';
  assert.deepEqual(await drainEmailOutbox(1), {accepted: 0, deferred: 1, failed: 0});
  assert.equal(state.outcomes[0].p_error, 'render_failed');
});

// -----------------------------------------------------------------------------
// 3. Queue Draining & Budget Controls
// -----------------------------------------------------------------------------
test('queue draining: empty queue terminates without error', async () => {
  resetState();
  state.events = [];
  const result = await drainEmailOutbox(3);
  assert.deepEqual(result, {accepted: 0, deferred: 0, failed: 0});
  assert.equal(state.outcomes.length, 0);
});

test('queue draining: clamps limit between 1 and 3', async () => {
  resetState();
  state.events = [createSyntheticEvent(), createSyntheticEvent(), createSyntheticEvent(), createSyntheticEvent()];
  globalThis.fetch = async () => new Response(JSON.stringify({id: 're_synthetic_1'}));

  // Limit of 5 should clamp to 3
  const result = await drainEmailOutbox(5);
  assert.equal(result.accepted, 3);
  assert.equal(state.events.length, 1); // 1 remaining

  // Limit of 0 should clamp to 1
  resetState();
  state.events = [createSyntheticEvent(), createSyntheticEvent()];
  const resultClamped = await drainEmailOutbox(0);
  assert.equal(resultClamped.accepted, 1);
});

test('queue draining: claim_email_event database error throws fail-closed', async () => {
  resetState();
  state.claimError = {message: 'synthetic database offline'};
  await assert.rejects(async () => await drainEmailOutbox(1), /Email queue unavailable/);
});

// -----------------------------------------------------------------------------
// 4. Two-Phase Authority Verification & Address Drift
// -----------------------------------------------------------------------------
test('authority checks: suppresses sending when recipient is invalid or unauthorized', async () => {
  resetState();
  state.events = [createSyntheticEvent()];
  state.recipient = null; // Phase 1 check returns null (banned, inactive, or unassigned)

  let fetchInvoked = false;
  globalThis.fetch = async () => {
    fetchInvoked = true;
    return new Response('{}');
  };

  const result = await drainEmailOutbox(1);
  assert.equal(result.failed, 1);
  assert.equal(fetchInvoked, false);
  assert.equal(state.outcomes[0].p_state, 'suppressed');
  assert.equal(state.outcomes[0].p_error, 'recipient_unavailable');
});

test('authority checks: suppresses sending if recipient authority changes right before dispatch', async () => {
  resetState();
  state.events = [createSyntheticEvent()];
  // Check 1 succeeds (for rendering/envelope save); Check 2 fails (e.g. role revoked right before HTTP call)
  state.recipient = (checkNumber) => (checkNumber === 1 ? 'client@example.test' : null);

  let fetchInvoked = false;
  globalThis.fetch = async () => {
    fetchInvoked = true;
    return new Response('{}');
  };

  const result = await drainEmailOutbox(1);
  assert.equal(result.failed, 1);
  assert.equal(fetchInvoked, false);
  assert.equal(state.outcomes[0].p_state, 'suppressed');
  assert.equal(state.outcomes[0].p_error, 'recipient_unavailable');
});

test('authority checks: suppresses sending if frozen envelope address differs from current Auth email', async () => {
  resetState();
  state.events = [
    createSyntheticEvent({
      envelope: {
        to: 'old-address@example.test',
        from: 'no-reply@redwan.work',
        subject: 'Synthetic',
        html: '<p>Synthetic</p>',
      },
    }),
  ];
  state.recipient = 'new-address@example.test';

  let fetchInvoked = false;
  globalThis.fetch = async () => {
    fetchInvoked = true;
    return new Response('{}');
  };

  const result = await drainEmailOutbox(1);
  assert.equal(result.failed, 1);
  assert.equal(fetchInvoked, false);
  assert.equal(state.outcomes[0].p_state, 'suppressed');
});

// -----------------------------------------------------------------------------
// 5. Provider Idempotency & Resend HTTP Status Handling
// -----------------------------------------------------------------------------
test('idempotency: 200 OK with valid provider ID succeeds and sets accepted state', async () => {
  resetState();
  state.events = [createSyntheticEvent({id: 'event-uuid-101'})];

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers['Idempotency-Key'], 'lifecycle/event-uuid-101');
    assert.equal(options.headers['Authorization'], 'Bearer re_synthetic_key_12345');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({id: 're_msg_valid_id_123'}));
  };

  const result = await drainEmailOutbox(1);
  assert.deepEqual(result, {accepted: 1, deferred: 0, failed: 0});
  assert.equal(state.outcomes[0].p_state, 'accepted');
  assert.equal(state.outcomes[0].p_provider, 're_msg_valid_id_123');
  assert.equal(state.outcomes[0].p_error, null);
});

test('idempotency: 200 OK with missing or malformed ID defers for retry without marking accepted', async () => {
  resetState();
  state.events = [createSyntheticEvent()];
  globalThis.fetch = async () => new Response(JSON.stringify({id: 'invalid id with spaces'}));

  const result = await drainEmailOutbox(1);
  assert.equal(result.deferred, 1);
  assert.equal(state.outcomes[0].p_state, 'pending');
  assert.equal(state.outcomes[0].p_error, 'provider_unavailable');
});

test('idempotency taxonomy: 409 concurrent_idempotent_requests defers, invalid_idempotent_request fails', async () => {
  const cases = [
    {
      status: 409,
      body: {name: 'concurrent_idempotent_requests', message: 'In flight'},
      expectedState: 'pending',
      deferred: 1,
      failed: 0,
    },
    {
      status: 409,
      body: {name: 'invalid_idempotent_request', message: 'Payload changed'},
      expectedState: 'failed',
      deferred: 0,
      failed: 1,
    },
    {
      status: 409,
      body: {name: 'unknown_conflict'},
      expectedState: 'failed',
      deferred: 0,
      failed: 1,
    },
    {
      status: 429,
      body: {message: 'Too many requests'},
      expectedState: 'pending',
      deferred: 1,
      failed: 0,
    },
    {
      status: 500,
      body: {message: 'Resend internal error'},
      expectedState: 'pending',
      deferred: 1,
      failed: 0,
    },
    {
      status: 400,
      body: {message: 'Bad request syntax'},
      expectedState: 'failed',
      deferred: 0,
      failed: 1,
    },
  ];

  for (const c of cases) {
    resetState();
    state.events = [createSyntheticEvent()];
    globalThis.fetch = async () => new Response(JSON.stringify(c.body), {status: c.status});

    const result = await drainEmailOutbox(1);
    assert.equal(result.deferred, c.deferred, `Deferred count mismatch for status ${c.status}`);
    assert.equal(result.failed, c.failed, `Failed count mismatch for status ${c.status}`);
    assert.equal(state.outcomes[0].p_state, c.expectedState);
    assert.equal(state.outcomes[0].p_error, 'provider_rejected');
  }
});

test('idempotency: oversized 409 response body fails closed', async () => {
  resetState();
  state.events = [createSyntheticEvent()];
  // Create an oversized body exceeding the 4096-byte boundary
  const largePayload = {
    name: 'concurrent_idempotent_requests',
    padding: 'a'.repeat(5000),
  };
  globalThis.fetch = async () => new Response(JSON.stringify(largePayload), {status: 409});

  const result = await drainEmailOutbox(1);
  assert.equal(result.failed, 1);
  assert.equal(state.outcomes[0].p_state, 'failed');
  assert.equal(state.outcomes[0].p_error, 'provider_rejected');
});

test('provider timeout and network errors defer for retry', async () => {
  resetState();
  state.events = [createSyntheticEvent()];
  globalThis.fetch = async () => {
    throw Object.assign(new Error('synthetic timeout'), {name: 'TimeoutError'});
  };

  const resultTimeout = await drainEmailOutbox(1);
  assert.equal(resultTimeout.deferred, 1);
  assert.equal(state.outcomes[0].p_state, 'pending');
  assert.equal(state.outcomes[0].p_error, 'provider_timeout');

  resetState();
  state.events = [createSyntheticEvent()];
  globalThis.fetch = async () => {
    throw new Error('synthetic network disconnect');
  };

  const resultNetwork = await drainEmailOutbox(1);
  assert.equal(resultNetwork.deferred, 1);
  assert.equal(state.outcomes[0].p_state, 'pending');
  assert.equal(state.outcomes[0].p_error, 'provider_unavailable');
});

// -----------------------------------------------------------------------------
// 6. Configuration & Persistence Guardrails
// -----------------------------------------------------------------------------
test('configuration: missing RESEND_API_KEY defers without network call', async () => {
  resetState();
  state.events = [createSyntheticEvent()];
  delete process.env.RESEND_API_KEY;

  let fetchInvoked = false;
  globalThis.fetch = async () => {
    fetchInvoked = true;
    return new Response('{}');
  };

  const result = await drainEmailOutbox(1);
  assert.equal(result.deferred, 1);
  assert.equal(fetchInvoked, false);
  assert.equal(state.outcomes[0].p_state, 'pending');
  assert.equal(state.outcomes[0].p_error, 'configuration_unavailable');
});

test('persistence: envelope save failure defers without network call', async () => {
  resetState();
  state.events = [createSyntheticEvent()];
  state.envelopeUpdateFail = true;

  let fetchInvoked = false;
  globalThis.fetch = async () => {
    fetchInvoked = true;
    return new Response('{}');
  };

  const result = await drainEmailOutbox(1);
  assert.equal(result.deferred, 1);
  assert.equal(fetchInvoked, false);
  assert.equal(state.outcomes[0].p_state, 'pending');
  assert.equal(state.outcomes[0].p_error, 'audit_unavailable');
});

test('persistence: outcome persistence failure (finish_email_event) throws fail-closed error', async () => {
  resetState();
  state.events = [createSyntheticEvent()];
  state.finishSuccess = false; // finish_email_event returned false (e.g. lease lost)
  globalThis.fetch = async () => new Response(JSON.stringify({id: 're_synthetic_1'}));

  await assert.rejects(
    async () => await drainEmailOutbox(1),
    /Email outcome persistence unavailable/
  );
});

// -----------------------------------------------------------------------------
// 7. Cron Endpoint Security & Response Classification
// -----------------------------------------------------------------------------
test('cron route: GET /api/cron/email-outbox requires valid Bearer token', async () => {
  const oldSecret = process.env.CRON_SECRET;
  try {
    process.env.CRON_SECRET = 'synthetic-secret-at-least-32-chars-long';

    // Missing header -> 401
    const resNoAuth = await cronHandler(
      new NextRequest('https://redwan.work/api/cron/email-outbox')
    );
    assert.equal(resNoAuth.status, 401);

    // Wrong token -> 401
    const resWrong = await cronHandler(
      new NextRequest('https://redwan.work/api/cron/email-outbox', {
        headers: {authorization: 'Bearer wrong-secret'},
      })
    );
    assert.equal(resWrong.status, 401);

    // Non-bearer scheme -> 401
    const resBasic = await cronHandler(
      new NextRequest('https://redwan.work/api/cron/email-outbox', {
        headers: {authorization: 'Basic synthetic'},
      })
    );
    assert.equal(resBasic.status, 401);

    // Valid bearer token with empty queue -> 200, no-store
    resetState();
    state.events = [];
    const resOk = await cronHandler(
      new NextRequest('https://redwan.work/api/cron/email-outbox', {
        headers: {authorization: `Bearer ${process.env.CRON_SECRET}`},
      })
    );
    assert.equal(resOk.status, 200);
    assert.equal(resOk.headers.get('cache-control'), 'no-store');

    // Valid bearer token with deferred events -> 503
    resetState();
    state.events = [createSyntheticEvent()];
    globalThis.fetch = async () => new Response('{}', {status: 500});
    const resDeferred = await cronHandler(
      new NextRequest('https://redwan.work/api/cron/email-outbox', {
        headers: {authorization: `Bearer ${process.env.CRON_SECRET}`},
      })
    );
    assert.equal(resDeferred.status, 503);
    assert.equal(resDeferred.headers.get('cache-control'), 'no-store');
  } finally {
    if (oldSecret !== undefined) process.env.CRON_SECRET = oldSecret;
    else delete process.env.CRON_SECRET;
  }
});

// -----------------------------------------------------------------------------
// 8. Diagnostic Redaction & Single Sender Integrity
// -----------------------------------------------------------------------------
test('diagnostic redaction: no raw provider bodies or tokens leak into outcome record', async () => {
  resetState();
  state.events = [createSyntheticEvent()];
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        name: 'concurrent_idempotent_requests',
        message: 'CONFIDENTIAL_INTERNAL_DATA_TOKEN_123',
      }),
      {status: 409}
    );

  await drainEmailOutbox(1);
  const outcomeJson = JSON.stringify(state.outcomes);
  assert.equal(outcomeJson.includes('CONFIDENTIAL_INTERNAL_DATA_TOKEN_123'), false);
  assert.equal(state.outcomes[0].p_error, 'provider_rejected');
});

test('legacy helper isolation: sendEmail refuses transport and defers to durable outbox', async () => {
  let fetchInvoked = false;
  globalThis.fetch = async () => {
    fetchInvoked = true;
    return new Response('{}');
  };

  const result = await sendEmail({
    to: 'synthetic@example.test',
    template: 'new-ticket',
    rendered: {subject: 'Synthetic', html: '<p>Synthetic</p>'},
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'Lifecycle delivery is managed by the durable outbox.');
  assert.equal(fetchInvoked, false);
});
