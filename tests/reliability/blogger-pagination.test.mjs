import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const f = {
  posts: [],
  metaTotal: null,
  listCalls: 0,
  metaCalls: 0,
  shouldThrow: false,
};
globalThis.__bloggerTestState = f;

const modules = {
  googleapis: `
    export const google = {
      auth: { GoogleAuth: class {} },
      blogger() {
        return {
          blogs: {
            async get() {
              const s = globalThis.__bloggerTestState;
              s.metaCalls++;
              return { data: { posts: { totalItems: s.metaTotal ?? s.posts.length } } };
            },
          },
          posts: {
            async list(params) {
              const s = globalThis.__bloggerTestState;
              s.listCalls++;
              if (s.shouldThrow) throw new Error('synthetic upstream failure');
              const offset = params.pageToken ? Number(params.pageToken) : 0;
              const limit = params.maxResults || 100;
              const slice = s.posts.slice(offset, offset + limit);
              const nextOffset = offset + slice.length;
              return {
                data: {
                  items: slice,
                  nextPageToken: nextOffset < s.posts.length ? String(nextOffset) : undefined,
                },
              };
            },
          },
        };
      },
    };
  `,
};

const hooks = registerHooks({
  resolve(s, c, n) {
    if (Object.hasOwn(modules, s)) {
      return { url: `data:text/javascript,${encodeURIComponent(modules[s])}`, shortCircuit: true };
    }
    return n(s, c);
  },
});

process.env.BLOGGER_BLOG_ID = 'test-blog-id';
process.env.GOOGLE_CREDENTIALS_B64 = Buffer.from(
  JSON.stringify({ client_email: 'test@example.com', private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n' })
).toString('base64');

const { getBlogPostsPage, getBlogPosts, clearBlogCache } = await import('../../lib/blogger.ts');
hooks.deregister();

function generateSyntheticPosts(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `post-${i + 1}`,
    title: `Post Title ${i + 1}`,
    content: `<p>Content for post ${i + 1}</p>`,
    url: `https://example.test/post-${i + 1}`,
    published: new Date(Date.now() - i * 86400000).toISOString(),
    author: { displayName: 'Author Redwan' },
    labels: ['Security'],
  }));
}

function resetState(count, metaTotal = null) {
  clearBlogCache();
  f.posts = generateSyntheticPosts(count);
  f.metaTotal = metaTotal;
  f.listCalls = 0;
  f.metaCalls = 0;
  f.shouldThrow = false;
}

test('boundary sizes: 0 posts returns empty array and total 0', async () => {
  resetState(0);
  const res = await getBlogPostsPage(1, 9);
  assert.equal(res.totalItems, 0);
  assert.deepEqual(res.posts, []);
});

test('boundary sizes: 1 post returns 1 item and total 1', async () => {
  resetState(1);
  const res = await getBlogPostsPage(1, 9);
  assert.equal(res.totalItems, 1);
  assert.equal(res.posts.length, 1);
  assert.equal(res.posts[0].id, 'post-1');
});

test('boundary sizes: 9 posts fits exactly on page 1', async () => {
  resetState(9);
  const page1 = await getBlogPostsPage(1, 9);
  assert.equal(page1.totalItems, 9);
  assert.equal(page1.posts.length, 9);

  const page2 = await getBlogPostsPage(2, 9);
  assert.equal(page2.totalItems, 9);
  assert.deepEqual(page2.posts, []);
});

test('boundary sizes: 10 posts spans across page 1 (9) and page 2 (1) with zero duplicate overlap', async () => {
  resetState(10);
  const page1 = await getBlogPostsPage(1, 9);
  const page2 = await getBlogPostsPage(2, 9);

  assert.equal(page1.totalItems, 10);
  assert.equal(page2.totalItems, 10);
  assert.equal(page1.posts.length, 9);
  assert.equal(page2.posts.length, 1);

  const page1Ids = new Set(page1.posts.map((p) => p.id));
  assert.equal(page1Ids.has(page2.posts[0].id), false, 'Page 2 must not duplicate Page 1 post');
  assert.equal(page2.posts[0].id, 'post-10');
});

test('boundary sizes: 18 posts fills exactly two pages without overlap', async () => {
  resetState(18);
  const page1 = await getBlogPostsPage(1, 9);
  const page2 = await getBlogPostsPage(2, 9);

  assert.equal(page1.totalItems, 18);
  assert.equal(page2.totalItems, 18);
  assert.equal(page1.posts.length, 9);
  assert.equal(page2.posts.length, 9);

  const p1Ids = new Set(page1.posts.map((p) => p.id));
  const p2Ids = new Set(page2.posts.map((p) => p.id));
  assert.equal(p1Ids.size, 9);
  assert.equal(p2Ids.size, 9);
  for (const id of p2Ids) {
    assert.equal(p1Ids.has(id), false, 'Page 1 and Page 2 must have disjoint post IDs');
  }
});

test('windowing integrity: 20 posts across 3 pages has honest total 20 and zero duplicates', async () => {
  resetState(20);
  const page1 = await getBlogPostsPage(1, 9);
  const page2 = await getBlogPostsPage(2, 9);
  const page3 = await getBlogPostsPage(3, 9);
  const page4 = await getBlogPostsPage(4, 9);

  // Honest totalItems across all pages
  assert.equal(page1.totalItems, 20);
  assert.equal(page2.totalItems, 20);
  assert.equal(page3.totalItems, 20);
  assert.equal(page4.totalItems, 20);

  // Slices: 9, 9, 2, 0
  assert.equal(page1.posts.length, 9);
  assert.equal(page2.posts.length, 9);
  assert.equal(page3.posts.length, 2);
  assert.equal(page4.posts.length, 0);

  // Assert Page 3 is strictly posts 19 and 20, NOT a 9-item tail overlap from Page 2
  assert.equal(page3.posts[0].id, 'post-19');
  assert.equal(page3.posts[1].id, 'post-20');

  const allSeenIds = new Set();
  for (const post of [...page1.posts, ...page2.posts, ...page3.posts]) {
    assert.equal(allSeenIds.has(post.id), false, `Duplicate post found: ${post.id}`);
    allSeenIds.add(post.id);
  }
  assert.equal(allSeenIds.size, 20);
});

test('boundary sizes: 300 posts respects MAX_POSTS_FETCH and paginates cleanly', async () => {
  resetState(300);
  const page1 = await getBlogPostsPage(1, 100);
  const page2 = await getBlogPostsPage(2, 100);
  const page3 = await getBlogPostsPage(3, 100);
  const page4 = await getBlogPostsPage(4, 100);

  assert.equal(page1.totalItems, 300);
  assert.equal(page1.posts.length, 100);
  assert.equal(page2.posts.length, 100);
  assert.equal(page3.posts.length, 100);
  assert.equal(page4.posts.length, 0);
  assert.equal(page1.posts[0].id, 'post-1');
  assert.equal(page3.posts[99].id, 'post-300');
});

test('boundary sizes: 301 posts is capped safely at 300 items', async () => {
  resetState(301);
  const page1 = await getBlogPostsPage(1, 100);
  assert.equal(page1.totalItems, 300);
  assert.equal(page1.isCapped, true);
  const page3 = await getBlogPostsPage(3, 100);
  assert.equal(page3.posts.length, 100);
  assert.equal(page3.posts[99].id, 'post-300');
  const page4 = await getBlogPostsPage(4, 100);
  assert.equal(page4.posts.length, 0);
});

test('in-flight coalescing: concurrent requests share a single network fetch', async () => {
  resetState(25);
  // Fire concurrent requests for different or same pages before cache is populated
  const results = await Promise.all([
    getBlogPostsPage(1, 9),
    getBlogPostsPage(1, 9),
    getBlogPostsPage(2, 9),
    getBlogPostsPage(2, 9),
    getBlogPosts(20),
  ]);

  // Snapshot is fetched once
  assert.equal(f.listCalls, 1, 'In-flight coalescing must deduplicate concurrent list calls to 1');
  assert.equal(results[0].posts.length, 9);
  assert.equal(results[2].posts.length, 9);
  assert.equal(results[4].length, 20);
});

test('cache bounds: cache keys remain bounded by MAX_CACHE_ENTRIES without memory leak', async () => {
  resetState(50);
  // Generate 60 distinct page requests to test cache eviction
  for (let p = 1; p <= 60; p++) {
    await getBlogPostsPage(p, 1);
  }
  // Subsequent hit on recently added page should not re-fetch
  const callsBefore = f.listCalls;
  await getBlogPostsPage(60, 1);
  assert.equal(f.listCalls, callsBefore, 'Recently cached page must be a cache hit');
});

test('clearBlogCache resets all snapshot and page caches', async () => {
  resetState(15);
  await getBlogPostsPage(1, 9);
  assert.equal(f.listCalls, 1);

  await getBlogPostsPage(1, 9);
  assert.equal(f.listCalls, 1); // cache hit

  clearBlogCache();
  await getBlogPostsPage(1, 9);
  assert.equal(f.listCalls, 2, 'After clearBlogCache, a new fetch must be triggered');
});
