import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { beforeEach } from 'node:test';

const f = {
  result: null,
  input: null,
  destroyed: 0,
  sendCalls: 0,
  // retention drainage fixture
  deletes: [],
  updates: [],
  rows: [],
  deleteFailsOnKey: null,
  updateCount: 1,
  current: null,
  ackError: false,
  limitReceived: null,
};
globalThis.__inventoryTest = f;

const modules = {
  'server-only': 'export {};',
  'archiver': 'export {};',
  '@/lib/crm/result': 'export {};',
  '@aws-sdk/client-s3': `
    export class ListObjectsV2Command {
      constructor(input) {
        this.input = input;
      }
    }
    export class S3Client {
      async send(command) {
        const t = globalThis.__inventoryTest;
        t.sendCalls++;
        t.input = command.input;
        if (typeof t.result === 'function') {
          return t.result(command.input);
        }
        if (t.result instanceof Error) throw t.result;
        return t.result;
      }
      destroy() {
        globalThis.__inventoryTest.destroyed++;
      }
    }
  `,
  '@/lib/r2': `
    export const ARCHIVE_MAX_BYTES = 104857600;
    export async function getPrivateObjectBytes() {
      throw new Error('unexpected storage read');
    }
    export async function putPrivateObject() {
      throw new Error('unexpected storage write');
    }
    export async function deletePrivateObjects(keys) {
      const t = globalThis.__inventoryTest;
      t.deletes.push(keys);
      for (const k of keys) {
        if (t.deleteFailsOnKey && t.deleteFailsOnKey === k) {
          throw new Error('synthetic-storage-deletion-failure');
        }
      }
      return keys.length;
    }
  `,
  '@/lib/supabase/admin': `
    export function getSupabaseAdmin() {
      const t = globalThis.__inventoryTest;
      return {
        from(table) {
          let updating = false;
          const q = {
            select() { return q; },
            is() { return q; },
            order() { return q; },
            limit(n) {
              t.limitReceived = n;
              return q;
            },
            update(patch, options) {
              if (options?.count !== 'exact') throw Error('Exact count required');
              updating = true;
              t.updates.push(patch);
              return q;
            },
            eq() { return q; },
            async maybeSingle() {
              return { data: table === 'storage_deletions' ? t.current : null, error: null };
            },
            then(resolve) {
              return Promise.resolve(
                updating
                  ? { count: t.updateCount, error: t.ackError ? { message: 'synthetic update error' } : null }
                  : { data: t.rows, error: null }
              ).then(resolve);
            }
          };
          return q;
        }
      };
    }
  `,
};

const hooks = registerHooks({
  resolve(s, c, n) {
    if (Object.hasOwn(modules, s)) {
      return { url: `data:text/javascript,${encodeURIComponent(modules[s])}`, shortCircuit: true };
    }
    if (s.startsWith('@/lib/')) {
      return { url: new URL('../../' + s.slice(2) + '.ts', import.meta.url).href, shortCircuit: true };
    }
    return n(s, c);
  },
});

const { privateInventoryPage } = await import('../../lib/r2-inventory.ts');
const { drainStorageDeletions } = await import('../../lib/crm/retention.ts');
hooks.deregister();

function reset() {
  for (const name of ['R2_ENDPOINT', 'R2_PRIVATE_BUCKET', 'R2_PRIVATE_ACCESS_KEY_ID', 'R2_PRIVATE_SECRET_ACCESS_KEY']) {
    process.env[name] = 'synthetic';
  }
  Object.assign(f, {
    result: null,
    input: null,
    destroyed: 0,
    sendCalls: 0,
    deletes: [],
    updates: [],
    rows: [],
    deleteFailsOnKey: null,
    updateCount: 1,
    current: null,
    ackError: false,
    limitReceived: null,
  });
}

beforeEach(reset);

test('bounded inventory: traverses above 1000 items across multiple pages to completion', async () => {
  reset();
  const totalItems = 1150;
  const allObjects = Array.from({ length: totalItems }, (_, i) => {
    const padded = String(i).padStart(4, '0');
    return {
      Key: `contact/file_${padded}.pdf`,
      LastModified: new Date(1700000000000 + i * 1000),
    };
  });

  // Mock S3 page responses
  f.result = (input) => {
    assert.equal(input.Bucket, 'synthetic');
    assert.equal(input.Prefix, 'contact/');
    assert.equal(input.MaxKeys, 100);

    const startIndex = input.StartAfter
      ? allObjects.findIndex((o) => o.Key === input.StartAfter) + 1
      : 0;

    const pageContents = allObjects.slice(startIndex, startIndex + 100);
    const isTruncated = startIndex + 100 < allObjects.length;

    return {
      IsTruncated: isTruncated,
      Contents: pageContents,
    };
  };

  const collectedItems = [];
  let cursor = '';
  let pages = 0;

  do {
    const page = await privateInventoryPage('contact/', cursor);
    collectedItems.push(...page.items);
    cursor = page.next;
    pages++;
  } while (cursor !== '');

  assert.equal(pages, 12, '1150 items at 100 per page should take 12 pages');
  assert.equal(collectedItems.length, totalItems, 'all 1150 items collected');
  assert.equal(f.destroyed, 12, 'client destroyed once per page');

  // Verify strict ordering and correct content extraction
  for (let i = 0; i < totalItems; i++) {
    const padded = String(i).padStart(4, '0');
    assert.equal(collectedItems[i].key, `contact/file_${padded}.pdf`);
    assert.equal(collectedItems[i].modified, new Date(1700000000000 + i * 1000).toISOString());
  }
});

test('bounded inventory: empty namespace wraps immediately with next as empty string', async () => {
  reset();
  f.result = { IsTruncated: false, Contents: [] };
  const page = await privateInventoryPage('private/', '');
  assert.deepEqual(page, { items: [], next: '' });
  assert.equal(f.input.StartAfter, undefined);
  assert.equal(f.destroyed, 1);
});

test('bounded inventory: exact boundary (100 items, not truncated) wraps cursor cleanly', async () => {
  reset();
  const contents = Array.from({ length: 100 }, (_, i) => ({
    Key: `contact/file_${String(i).padStart(3, '0')}.pdf`,
    LastModified: new Date(1700000000000 + i * 1000),
  }));
  f.result = { IsTruncated: false, Contents: contents };
  const page = await privateInventoryPage('contact/', '');
  assert.equal(page.items.length, 100);
  assert.equal(page.next, '', 'non-truncated final page must wrap cursor to empty string');
  assert.equal(f.destroyed, 1);
});

test('bounded inventory: rejects invalid cursor not starting with prefix', async () => {
  reset();
  await assert.rejects(
    privateInventoryPage('contact/', 'private/other.pdf'),
    { message: 'Invalid inventory cursor.' }
  );
  await assert.rejects(
    privateInventoryPage('private/', 'contact/other.pdf'),
    { message: 'Invalid inventory cursor.' }
  );
  assert.equal(f.sendCalls, 0, 'must reject before contacting S3');
  assert.equal(f.destroyed, 0);
});

test('bounded inventory: rejects missing storage environment configuration', async () => {
  for (const envVar of ['R2_ENDPOINT', 'R2_PRIVATE_BUCKET', 'R2_PRIVATE_ACCESS_KEY_ID', 'R2_PRIVATE_SECRET_ACCESS_KEY']) {
    reset();
    delete process.env[envVar];
    await assert.rejects(
      privateInventoryPage('contact/', ''),
      { message: 'Storage unavailable.' }
    );
    assert.equal(f.sendCalls, 0);
  }
});

test('bounded inventory: rejects out-of-order, duplicate, and foreign keys non-destructively', async () => {
  const invalidResponses = [
    // Duplicate key (equal to previous)
    {
      Contents: [
        { Key: 'contact/a.pdf', LastModified: new Date() },
        { Key: 'contact/a.pdf', LastModified: new Date() },
      ],
      IsTruncated: false,
    },
    // Decreasing key (out of lexicographical order)
    {
      Contents: [
        { Key: 'contact/b.pdf', LastModified: new Date() },
        { Key: 'contact/a.pdf', LastModified: new Date() },
      ],
      IsTruncated: false,
    },
    // Foreign prefix leakage
    {
      Contents: [
        { Key: 'private/a.pdf', LastModified: new Date() },
      ],
      IsTruncated: false,
    },
    // Root / un-prefixed key leakage
    {
      Contents: [
        { Key: 'public_assets/banner.png', LastModified: new Date() },
      ],
      IsTruncated: false,
    },
    // Missing key
    {
      Contents: [
        { Key: '', LastModified: new Date() },
      ],
      IsTruncated: false,
    },
    // Missing LastModified timestamp
    {
      Contents: [
        { Key: 'contact/a.pdf', LastModified: null },
      ],
      IsTruncated: false,
    },
  ];

  for (const result of invalidResponses) {
    reset();
    f.result = result;
    await assert.rejects(
      privateInventoryPage('contact/', 'contact/0.pdf'),
      { message: 'Storage inventory incomplete.' }
    );
    assert.equal(f.destroyed, 1, 'client must be destroyed even on validation failure');
  }
});

test('bounded inventory: truncated page with zero items throws no progress error', async () => {
  reset();
  f.result = { IsTruncated: true, Contents: [] };
  await assert.rejects(
    privateInventoryPage('contact/', ''),
    { message: 'Storage inventory made no progress.' }
  );
  assert.equal(f.destroyed, 1);
});

test('drainStorageDeletions: clamps requested limit between 1 and 100', async () => {
  reset();
  f.rows = [];

  // Requesting 1000 clamped to 100
  await drainStorageDeletions(1000);
  assert.equal(f.limitReceived, 100);

  // Requesting 500 clamped to 100
  await drainStorageDeletions(500);
  assert.equal(f.limitReceived, 100);

  // Requesting 50 stays 50
  await drainStorageDeletions(50);
  assert.equal(f.limitReceived, 50);

  // Requesting 0 clamped to 1
  await drainStorageDeletions(0);
  assert.equal(f.limitReceived, 1);

  // Requesting negative clamped to 1
  await drainStorageDeletions(-5);
  assert.equal(f.limitReceived, 1);
});

test('drainStorageDeletions: partial batch failure records successes and leaves failed rows retryable', async () => {
  reset();
  f.rows = [
    { r2_key: 'private/user/ticket_1/file_1.pdf' },
    { r2_key: 'private/user/ticket_1/file_2.pdf' },
    { r2_key: 'private/user/ticket_1/file_3.pdf' },
  ];
  // Make the second file fail during S3 deletion
  f.deleteFailsOnKey = 'private/user/ticket_1/file_2.pdf';

  const result = await drainStorageDeletions(100);
  assert.deepEqual(result, { completed: 2, failed: 1 });
  assert.equal(f.updates.length, 2, 'two successful deletions updated completed_at');
  assert.ok(f.updates[0].completed_at);
  assert.ok(f.updates[1].completed_at);
});

test('drainStorageDeletions: concurrent worker completion is recognized without false errors', async () => {
  reset();
  f.rows = [{ r2_key: 'private/user/ticket_1/file_already_done.pdf' }];
  f.updateCount = 0; // our update matched 0 rows
  f.current = { completed_at: '2026-09-17T00:00:00.000Z' }; // peer completed it

  const result = await drainStorageDeletions(100);
  assert.deepEqual(result, { completed: 0, failed: 0 }, 'peer completion is skipped without error');
});
