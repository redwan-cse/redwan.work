import assert from 'node:assert/strict';
import test, {after, beforeEach} from 'node:test';
import {registerHooks} from 'node:module';

const state = {queue: [], calls: 0};
globalThis.__bloggerInvalidation = state;
const oldEnvironment = Object.fromEntries(
  ['BLOGGER_BLOG_ID', 'GOOGLE_CREDENTIALS_B64'].map(key => [key, process.env[key]])
);
process.env.BLOGGER_BLOG_ID = 'synthetic-blog';
process.env.GOOGLE_CREDENTIALS_B64 = Buffer.from('{}').toString('base64');
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier !== 'googleapis') return next(specifier, context);
    return {url: 'data:text/javascript,' + encodeURIComponent(`
      export const google = {
        auth: {GoogleAuth: class {}},
        blogger() {
          return {
            posts: {async list() {
              const state = globalThis.__bloggerInvalidation;
              state.calls++;
              const deferred = state.queue.shift();
              if (!deferred) throw new Error('Unexpected synthetic Blogger request');
              return {data: {items: await deferred.promise}};
            }},
            blogs: {async get() {return {data: {posts: {totalItems: 2}}};}},
          };
        },
      };
    `), shortCircuit: true};
  },
});
const {getBlogPostsPage, clearBlogCache} = await import('../../lib/blogger.ts');
hooks.deregister();
beforeEach(() => {
  clearBlogCache();
  state.queue = [];
  state.calls = 0;
});
after(() => {
  clearBlogCache();
  delete globalThis.__bloggerInvalidation;
  for (const [key, value] of Object.entries(oldEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function deferred() {
  const result = {};
  result.promise = new Promise((resolve, reject) => Object.assign(result, {resolve, reject}));
  return result;
}
function posts(version) {
  return [1, 2].map(n => ({
    id: `${version}-${n}`, title: `${version} ${n}`, content: 'synthetic',
    url: `https://example.test/${version}/${n}`, published: '2026-01-01T00:00:00Z',
  }));
}
function startAcrossInvalidation() {
  const old = deferred(), fresh = deferred();
  state.queue.push(old, fresh);
  const oldRequest = getBlogPostsPage(1, 1);
  assert.equal(state.calls, 1);
  clearBlogCache();
  const freshRequest = getBlogPostsPage(1, 1);
  assert.equal(state.calls, 2);
  return {old, fresh, oldRequest, freshRequest};
}

test('old successful work cannot overwrite post-clear page or raw caches', {timeout: 5000}, async () => {
  const {old, fresh, oldRequest, freshRequest} = startAcrossInvalidation();
  fresh.resolve(posts('fresh'));
  assert.equal((await freshRequest).posts[0].id, 'fresh-1');
  old.resolve(posts('old'));
  assert.equal((await oldRequest).posts[0].id, 'old-1');
  assert.equal((await getBlogPostsPage(1, 1)).posts[0].id, 'fresh-1');
  assert.equal((await getBlogPostsPage(2, 1)).posts[0].id, 'fresh-2');
  assert.equal(state.calls, 2);
});

test('old completion cannot publish stale data while post-clear work is pending', {timeout: 5000}, async () => {
  const {old, fresh, oldRequest, freshRequest} = startAcrossInvalidation();
  old.resolve(posts('old'));
  await oldRequest;
  const samePage = getBlogPostsPage(1, 1);
  const otherPage = getBlogPostsPage(2, 1);
  fresh.resolve(posts('fresh'));
  const results = await Promise.all([freshRequest, samePage, otherPage]);
  assert.deepEqual(results.map(result => result.posts[0]?.id), ['fresh-1', 'fresh-1', 'fresh-2']);
  assert.equal(state.calls, 2, 'post-clear requests must keep sharing the current fetch');
});

test('old failure cannot clear a newer in-flight request or cache an empty stale page', {timeout: 5000}, async () => {
  const {old, fresh, oldRequest, freshRequest} = startAcrossInvalidation();
  old.reject(new Error('Synthetic pre-clear upstream failure'));
  assert.deepEqual((await oldRequest).posts, []);
  const samePage = getBlogPostsPage(1, 1);
  const otherPage = getBlogPostsPage(2, 1);
  fresh.resolve(posts('fresh'));
  const results = await Promise.all([freshRequest, samePage, otherPage]);
  assert.deepEqual(results.map(result => result.posts[0]?.id), ['fresh-1', 'fresh-1', 'fresh-2']);
  assert.equal(state.calls, 2, 'old finally must not erase the current raw/page promise');
});

test('multiple clears admit only the newest generation into caches', {timeout: 5000}, async () => {
  const {old, fresh, oldRequest, freshRequest} = startAcrossInvalidation();
  const newest = deferred();
  state.queue.push(newest);
  clearBlogCache();
  const newestRequest = getBlogPostsPage(1, 1);
  newest.resolve(posts('newest'));
  await newestRequest;
  fresh.resolve(posts('fresh'));
  old.resolve(posts('old'));
  await Promise.all([oldRequest, freshRequest]);
  assert.equal((await getBlogPostsPage(1, 1)).posts[0].id, 'newest-1');
  assert.equal((await getBlogPostsPage(2, 1)).posts[0].id, 'newest-2');
  assert.equal(state.calls, 3);
});
