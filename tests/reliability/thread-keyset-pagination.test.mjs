import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';

const ticketId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const foreignId = '99999999-9999-4999-8999-999999999999';

// Synthetic database state
const state = {
  messages: [],
  ticketReadError: null,
  messageReadError: null,
  accountReadError: null,
  messageQueries: 0,
  ticketQueries: 0,
};
globalThis.__threadKeysetTest = state;

const modules = {
  'server-only': 'export {};',
  '@/lib/supabase/admin': `export function getSupabaseAdmin() {
    const s = globalThis.__threadKeysetTest;
    return {
      from: (table) => {
        let filters = [];
        let orFilter = null;
        let orderClauses = [];
        let rowLimit = null;

        const query = {
          select: () => query,
          eq: (col, val) => {
            filters.push([col, val]);
            return query;
          },
          or: (val) => {
            orFilter = val;
            return query;
          },
          order: (col, opts) => {
            orderClauses.push([col, opts?.ascending ?? true]);
            return query;
          },
          limit: (n) => {
            rowLimit = n;
            return query;
          },
          maybeSingle: async () => {
            s.ticketQueries++;
            if (s.ticketReadError) return { data: null, error: s.ticketReadError };
            const isTicketCol = filters.some(([col, val]) => col === 'id' && val === '${ticketId}');
            const isOwnerCol = filters.some(([col, val]) => col === 'client_id' && val === '${ownerId}');
            if (!isTicketCol) return { data: null, error: null };
            // If client_id is filtered and doesn't match owner, return null (foreign ticket)
            if (filters.some(([col]) => col === 'client_id') && !isOwnerCol) {
              return { data: null, error: null };
            }
            return {
              data: {
                id: '${ticketId}',
                number: 101,
                subject: 'Synthetic Conversation',
                status: 'open',
                last_message_at: '2026-09-12T12:00:00Z',
                created_at: '2026-09-12T10:00:00Z',
                client_id: '${ownerId}',
                profiles: { full_name: 'Synthetic Client' },
              },
              error: null,
            };
          },
          then: (resolve, reject) => {
            s.messageQueries++;
            if (s.messageReadError) {
              return Promise.resolve({ data: null, error: s.messageReadError }).then(resolve, reject);
            }
            let rows = [...s.messages];
            if (orFilter) {
              const m = orFilter.match(/^created_at\\.(lt|gt)\\.(.+),and\\(created_at\\.eq\\.(.+),id\\.(lt|gt)\\.([0-9a-f-]+)\\)$/);
              if (m) {
                const op = m[1];
                const ts = m[2];
                const id = m[5];
                rows = rows.filter(r => {
                  if (op === 'lt') {
                    return r.created_at < ts || (r.created_at === ts && r.id < id);
                  } else {
                    return r.created_at > ts || (r.created_at === ts && r.id > id);
                  }
                });
              }
            }
            // Sort by created_at then id
            rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
            if (orderClauses.length > 0 && orderClauses[0][1] === false) {
              rows.reverse();
            }
            if (rowLimit !== null) {
              rows = rows.slice(0, rowLimit);
            }
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          },
        };
        return query;
      },
      auth: {
        admin: {
          getUserById: async (id) => {
            if (s.accountReadError) return { data: null, error: s.accountReadError };
            return { data: { user: { email: 'client@example.test' } }, error: null };
          },
        },
      },
    };
  }`,
  '@/lib/email': `export function queueEmail() {}
export async function recordUnsent() {}
export async function sendNewTicketEmail() {}
export async function sendReplyPostedEmail() {}
export async function sendStatusChangedEmail() {}
export async function sendToAll() {}`,
  '@/lib/email/recipients': `export async function adminRecipients() { return []; }
export async function emailOrigin() { return 'https://redwan.work'; }
export async function recipientEmail() { return 'client@example.test'; }
export async function recipientName() { return 'Client'; }
export async function ticketEmailContext() { return null; }`,
};

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(modules, specifier)) {
      return {
        url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]),
        shortCircuit: true,
      };
    }
    if (specifier === '@/lib/crm/thread-pagination') {
      return {
        url: new URL('../../lib/crm/thread-pagination.ts', import.meta.url).href,
        shortCircuit: true,
      };
    }
    if (specifier.startsWith('@/lib/')) {
      return {
        url: new URL('../../' + specifier.slice(2) + '.ts', import.meta.url).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {getOwnTicketThread, getTicketThread} = await import('../../lib/crm/tickets.ts');
const {
  decodeThreadCursor,
  encodeThreadCursor,
  threadCursorFilter,
  threadWindow,
  THREAD_PAGE_SIZE,
} = await import('../../lib/crm/thread-pagination.ts');
hooks.deregister();

function resetState() {
  state.messages = [];
  state.ticketReadError = null;
  state.messageReadError = null;
  state.accountReadError = null;
  state.messageQueries = 0;
  state.ticketQueries = 0;
}

function generateMessages(count, timestampFn) {
  return Array.from({length: count}, (_, i) => {
    const ts = timestampFn
      ? timestampFn(i)
      : `2026-09-12T10:00:${String(Math.floor(i / 60)).padStart(2, '0')}.${String(i % 60).padStart(2, '0')}0000Z`;
    return {
      id: `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`,
      body: `Message body ${i}`,
      created_at: ts,
      profiles: {
        full_name: i % 2 === 0 ? 'Alice Admin' : 'Bob Client',
        role: i % 2 === 0 ? 'admin' : 'client',
      },
    };
  });
}

// -----------------------------------------------------------------------------
// 1. Cursor Encoding, Decoding & Tamper Resistance
// -----------------------------------------------------------------------------
test('cursor encoding: round-trips valid cursor and preserves microsecond timestamp', () => {
  const row = {
    id: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-09-12T14:30:00.123456+00:00',
  };
  const encoded = encodeThreadCursor(ticketId, row, 'older');
  const decoded = decodeThreadCursor(encoded, ticketId);
  assert.ok(decoded);
  assert.equal(decoded.v, 1);
  assert.equal(decoded.ticketId, ticketId);
  assert.equal(decoded.id, row.id);
  assert.equal(decoded.createdAt, row.created_at);
  assert.equal(decoded.direction, 'older');
});

test('cursor tampering: rejects cross-ticket cursor replay', () => {
  const otherTicketId = '55555555-5555-4555-8555-555555555555';
  const row = {
    id: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-09-12T14:30:00.000000Z',
  };
  const encodedForTicket1 = encodeThreadCursor(ticketId, row, 'older');

  // Attempt to use cursor for Ticket 1 on Ticket 2
  assert.equal(decodeThreadCursor(encodedForTicket1, otherTicketId), false);
});

test('cursor tampering: rejects PostgREST filter injection in id or timestamp', () => {
  // Injection attempt in id
  const hostilePayloadId = {
    v: 1,
    ticketId,
    createdAt: '2026-09-12T14:30:00Z',
    id: '44444444-4444-4444-8444-444444444444),ticket_id.neq.0',
    direction: 'older',
  };
  const rawHostileId = Buffer.from(JSON.stringify(hostilePayloadId)).toString('base64url');
  assert.equal(decodeThreadCursor(rawHostileId, ticketId), false);

  // Injection attempt in createdAt
  const hostilePayloadTs = {
    v: 1,
    ticketId,
    createdAt: '2026-09-12T14:30:00Z),or(id.gt.0',
    id: '44444444-4444-4444-8444-444444444444',
    direction: 'older',
  };
  const rawHostileTs = Buffer.from(JSON.stringify(hostilePayloadTs)).toString('base64url');
  assert.equal(decodeThreadCursor(rawHostileTs, ticketId), false);
});

test('cursor validation: rejects calendar errors and non-UTC offsets', () => {
  const invalidTimestamps = [
    '2026-02-29T12:00:00Z', // 2026 is not a leap year
    '2026-04-31T12:00:00Z', // April has 30 days
    '2026-13-01T12:00:00Z', // Month 13
    '2026-09-12T25:00:00Z', // Hour 25
    '2026-09-12T12:00:00+05:00', // Non-UTC offset
    '2026-09-12T12:00:00-04:00', // Non-UTC offset
    '2026-09-12 12:00:00Z', // Missing 'T'
  ];

  for (const ts of invalidTimestamps) {
    const payload = {
      v: 1,
      ticketId,
      createdAt: ts,
      id: '44444444-4444-4444-8444-444444444444',
      direction: 'older',
    };
    const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
    assert.equal(decodeThreadCursor(raw, ticketId), false, `Should reject timestamp: ${ts}`);
  }
});

test('cursor validation: rejects non-base64url encoding, extra keys, and primitive payloads', () => {
  // Standard base64 with padding '='
  assert.equal(decodeThreadCursor('eyJ2IjoxfQ==', ticketId), false);

  // Extra keys in payload
  const withExtra = {
    v: 1,
    ticketId,
    createdAt: '2026-09-12T14:30:00Z',
    id: '44444444-4444-4444-8444-444444444444',
    direction: 'older',
    injectedField: true,
  };
  const rawWithExtra = Buffer.from(JSON.stringify(withExtra)).toString('base64url');
  assert.equal(decodeThreadCursor(rawWithExtra, ticketId), false);

  // Primitive payload / array
  const rawArray = Buffer.from(JSON.stringify([1, 2, 3])).toString('base64url');
  assert.equal(decodeThreadCursor(rawArray, ticketId), false);

  const rawString = Buffer.from(JSON.stringify('just a string')).toString('base64url');
  assert.equal(decodeThreadCursor(rawString, ticketId), false);
});

// -----------------------------------------------------------------------------
// 2. Keyset Filter & Deterministic Tiebreakers
// -----------------------------------------------------------------------------
test('filter construction: generates compound keyset filters preserving direction and microseconds', () => {
  const olderCursor = {
    v: 1,
    ticketId,
    createdAt: '2026-09-12T10:00:00.987654Z',
    id: '44444444-4444-4444-8444-444444444444',
    direction: 'older',
  };
  assert.equal(
    threadCursorFilter(olderCursor),
    'created_at.lt.2026-09-12T10:00:00.987654Z,and(created_at.eq.2026-09-12T10:00:00.987654Z,id.lt.44444444-4444-4444-8444-444444444444)'
  );

  const newerCursor = {
    v: 1,
    ticketId,
    createdAt: '2026-09-12T10:00:00.987654Z',
    id: '44444444-4444-4444-8444-444444444444',
    direction: 'newer',
  };
  assert.equal(
    threadCursorFilter(newerCursor),
    'created_at.gt.2026-09-12T10:00:00.987654Z,and(created_at.eq.2026-09-12T10:00:00.987654Z,id.gt.44444444-4444-4444-8444-444444444444)'
  );
});

// -----------------------------------------------------------------------------
// 3. Sub-Second Microsecond Timestamp Collision Resolution
// -----------------------------------------------------------------------------
test('keyset pagination: deterministically resolves identical microsecond timestamps across page boundaries', async () => {
  resetState();
  // 60 messages sharing the EXACT same timestamp, differing only by UUID
  const sharedTimestamp = '2026-09-12T12:00:00.500000Z';
  state.messages = generateMessages(60, () => sharedTimestamp);

  // Page 1 (latest 50 messages)
  const page1 = await getOwnTicketThread(ownerId, ticketId);
  assert.equal(page1.ok, true);
  assert.equal(page1.messages.length, THREAD_PAGE_SIZE);
  assert.equal(page1.pageInfo.isLatest, true);
  assert.ok(page1.pageInfo.olderCursor);

  // Page 2 (remaining 10 messages)
  const page2 = await getOwnTicketThread(ownerId, ticketId, page1.pageInfo.olderCursor);
  assert.equal(page2.ok, true);
  assert.equal(page2.messages.length, 10);
  assert.equal(page2.pageInfo.olderCursor, null);
  assert.ok(page2.pageInfo.newerCursor);

  // Verify complete set: exactly 60 distinct messages visited
  const allIds = [...page2.messages.map(m => m.id), ...page1.messages.map(m => m.id)];
  assert.equal(allIds.length, 60);
  assert.equal(new Set(allIds).size, 60);
  assert.deepEqual(allIds, state.messages.map(m => m.id));
});

// -----------------------------------------------------------------------------
// 4. Page Sizing & Lookahead Invariants (0, 1, 50, 51, 100)
// -----------------------------------------------------------------------------
test('page boundaries: empty thread (0 messages) returns clean latest window', async () => {
  resetState();
  state.messages = [];
  const res = await getOwnTicketThread(ownerId, ticketId);
  assert.equal(res.ok, true);
  assert.deepEqual(res.messages, []);
  assert.equal(res.pageInfo.isLatest, true);
  assert.equal(res.pageInfo.olderCursor, null);
  assert.equal(res.pageInfo.newerCursor, null);
});

test('page boundaries: single message returns clean latest window', async () => {
  resetState();
  state.messages = generateMessages(1);
  const res = await getOwnTicketThread(ownerId, ticketId);
  assert.equal(res.ok, true);
  assert.equal(res.messages.length, 1);
  assert.equal(res.pageInfo.isLatest, true);
  assert.equal(res.pageInfo.olderCursor, null);
  assert.equal(res.pageInfo.newerCursor, null);
});

test('page boundaries: exactly 50 messages has no olderCursor', async () => {
  resetState();
  state.messages = generateMessages(50);
  const res = await getOwnTicketThread(ownerId, ticketId);
  assert.equal(res.ok, true);
  assert.equal(res.messages.length, 50);
  assert.equal(res.pageInfo.isLatest, true);
  assert.equal(res.pageInfo.olderCursor, null);
});

test('page boundaries: exactly 51 messages triggers olderCursor lookahead', async () => {
  resetState();
  state.messages = generateMessages(51);
  const res = await getOwnTicketThread(ownerId, ticketId);
  assert.equal(res.ok, true);
  assert.equal(res.messages.length, 50);
  assert.equal(res.pageInfo.isLatest, true);
  assert.ok(res.pageInfo.olderCursor);

  // Navigate older
  const olderRes = await getOwnTicketThread(ownerId, ticketId, res.pageInfo.olderCursor);
  assert.equal(olderRes.ok, true);
  assert.equal(olderRes.messages.length, 1);
  assert.equal(olderRes.pageInfo.olderCursor, null);
  assert.ok(olderRes.pageInfo.newerCursor);
});

// -----------------------------------------------------------------------------
// 5. Caller Scoping & Anti-Enumeration
// -----------------------------------------------------------------------------
test('caller scoping: foreign client receives opaque not_found without message queries', async () => {
  resetState();
  state.messages = generateMessages(10);

  const res = await getOwnTicketThread(foreignId, ticketId);
  assert.equal(res.ok, false);
  assert.equal(res.kind, 'not_found');
  assert.equal(res.error, 'Ticket not found.');
  assert.equal(state.messageQueries, 0); // Must NOT leak or query messages for unowned ticket
});

test('error mapping: database failures return retryable unavailable error', async () => {
  resetState();
  state.messages = generateMessages(10);
  state.messageReadError = {message: 'synthetic postgres connection timeout'};

  const res = await getOwnTicketThread(ownerId, ticketId);
  assert.equal(res.ok, false);
  assert.equal(res.kind, 'unavailable');
  assert.equal(res.error, 'Could not load messages.');
});

// -----------------------------------------------------------------------------
// 6. Author Role Hydration & Missing Profile Safety
// -----------------------------------------------------------------------------
test('author hydration: correctly maps admin vs client roles and handles null profiles', async () => {
  resetState();
  state.messages = [
    {
      id: '33333333-3333-4333-8333-000000000001',
      body: 'Admin response',
      created_at: '2026-09-12T10:00:00Z',
      profiles: {full_name: 'Super Admin', role: 'admin'},
    },
    {
      id: '33333333-3333-4333-8333-000000000002',
      body: 'Client reply',
      created_at: '2026-09-12T10:01:00Z',
      profiles: {full_name: 'Client User', role: 'client'},
    },
    {
      id: '33333333-3333-4333-8333-000000000003',
      body: 'Orphaned message from deleted profile',
      created_at: '2026-09-12T10:02:00Z',
      profiles: null, // Profile deleted
    },
  ];

  const res = await getOwnTicketThread(ownerId, ticketId);
  assert.equal(res.ok, true);
  assert.equal(res.messages[0].author_role, 'admin');
  assert.equal(res.messages[0].author_name, 'Super Admin');

  assert.equal(res.messages[1].author_role, 'client');
  assert.equal(res.messages[1].author_name, 'Client User');

  assert.equal(res.messages[2].author_role, 'client');
  assert.equal(res.messages[2].author_name, null);
});
