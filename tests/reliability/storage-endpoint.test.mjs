import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { registerHooks } from 'node:module';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';

// Constructor tests use a leaf SDK adapter. The separate child tests below use
// the real locked SDK and presigner, replacing only the network transport.
const uid = '11111111-1111-4111-8111-111111111111';
const portal = `private/${uid}/pending/${uid}.pdf`;
const final = `private/${uid}/pending/11111111-1111-5111-8111-111111111111.pdf`;
const payload = Buffer.from('abc');
const fixture = { clients: [], calls: [], destroyed: 0, response: null };
globalThis.__storageEndpoint = fixture;
const env = {
  R2_ENDPOINT: 'http://storage:9000',
  R2_PRIVATE_BUCKET: 'synthetic-private',
  R2_PUBLIC_BUCKET: 'synthetic-public',
  R2_PRIVATE_ACCESS_KEY_ID: 'synthetic-private-access',
  R2_PRIVATE_SECRET_ACCESS_KEY: 'synthetic-private-secret',
  R2_PUBLIC_ACCESS_KEY_ID: 'synthetic-public-access',
  R2_PUBLIC_SECRET_ACCESS_KEY: 'synthetic-public-secret',
};
const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
Object.assign(process.env, env);
const modules = {
  'server-only': 'export {};',
  '@aws-sdk/client-s3': `
    export class S3Client {
      constructor(config) { globalThis.__storageEndpoint.clients.push(config); }
      async send(command) {
        const f = globalThis.__storageEndpoint;
        f.calls.push(command);
        return f.response(command);
      }
      destroy() { globalThis.__storageEndpoint.destroyed++; }
    }
    class Command { constructor(input) { this.input = input; } }
    export class GetObjectCommand extends Command {}
    export class HeadObjectCommand extends Command {}
    export class PutObjectCommand extends Command {}
    export class DeleteObjectCommand extends Command {}
    export class DeleteObjectsCommand extends Command {}
    export class ListObjectsV2Command extends Command {}
  `,
  '@aws-sdk/s3-request-presigner': 'export async function getSignedUrl() { throw Error("Unexpected unit signing"); }',
};
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (Object.hasOwn(modules, specifier)) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
  if (specifier === '@/lib/mime') return { url: new URL('../../lib/mime.ts', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const r2 = await import('../../lib/r2.ts');
const recovery = await import('../../lib/crm/recovery-storage.ts');
after(() => {
  hooks.deregister();
  delete globalThis.__storageEndpoint;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function reset() {
  fixture.clients = []; fixture.calls = []; fixture.destroyed = 0;
  fixture.response = () => ({ ContentLength: payload.length, Body: Readable.from([payload]) });
}
function configured(kind) {
  assert.equal(fixture.clients.length, 1);
  const config = fixture.clients[0];
  assert.equal(config.forcePathStyle, true, 'Configured endpoint must not acquire a bucket hostname');
  assert.deepEqual(config, {
    region: 'auto', endpoint: env.R2_ENDPOINT, forcePathStyle: true,
    credentials: { accessKeyId: env[`R2_${kind}_ACCESS_KEY_ID`], secretAccessKey: env[`R2_${kind}_SECRET_ACCESS_KEY`] },
  });
  assert.equal(fixture.calls[0].input.Bucket, env[`R2_${kind}_BUCKET`]);
}
test('storage constructor private HEAD keeps endpoint and private credentials', async () => {
  reset();
  assert.equal(await r2.getPrivateObjectSize(portal), payload.length);
  configured('PRIVATE');
});
test('storage constructor public PUT keeps endpoint and public credentials', async () => {
  reset();
  await r2.putPublicObject('assets/2026/synthetic.pdf', payload, 'application/pdf');
  configured('PUBLIC');
});
test('storage constructor recovery GET keeps endpoint and bounded byte read', async () => {
  reset();
  assert.deepEqual(await recovery.readRecoveryBytes(portal, payload.length), payload);
  configured('PRIVATE');
  assert.equal(fixture.destroyed, 1);
});
test('storage constructor recovery PUT preserves the conditional-write fence', async () => {
  reset();
  await recovery.writeRestoredObject(final, payload, 'application/pdf');
  configured('PRIVATE');
  assert.equal(fixture.calls[0].input.IfNoneMatch, '*');
  assert.equal(fixture.calls[0].input.ContentLength, payload.length);
  assert.equal(fixture.destroyed, 1);
});
test('storage constructor invalid destinations remain refused before client creation', async () => {
  reset();
  await assert.rejects(r2.presignPrivatePut(final, 'application/pdf', 3), /Invalid upload destination/);
  await assert.rejects(r2.putPublicObject('../private/file.pdf', payload, 'application/pdf'), /Invalid asset key/);
  await assert.rejects(recovery.readRecoveryBytes('../private/file.pdf'), /Recovery storage unavailable/);
  assert.equal(fixture.clients.length, 0);
});
test('storage constructor missing credentials remain fail-closed', async () => {
  reset();
  delete process.env.R2_PRIVATE_SECRET_ACCESS_KEY;
  delete process.env.R2_PUBLIC_SECRET_ACCESS_KEY;
  try {
    await assert.rejects(r2.getPrivateObjectSize(portal), /Private storage is not configured/);
    await assert.rejects(r2.putPublicObject('assets/2026/synthetic.pdf', payload, 'application/pdf'), /Public storage is not configured/);
    await assert.rejects(recovery.readRecoveryBytes(portal), /Recovery storage unavailable/);
    assert.equal(fixture.clients.length, 0);
  } finally { Object.assign(process.env, env); }
});
test('storage constructor conditional conflicts still compare actual returned bytes', async () => {
  for (const same of [true, false]) {
    reset();
    fixture.response = () => {
      if (fixture.calls.length === 1) throw Object.assign(Error('synthetic conflict'), { $metadata: { httpStatusCode: 412 } });
      return { ContentLength: 3, Body: Readable.from([same ? payload : Buffer.from('xyz')]) };
    };
    const work = recovery.writeRestoredObject(final, payload, 'application/pdf');
    if (same) await work;
    else await assert.rejects(work, /Recovery object conflict/);
    assert.equal(fixture.calls.length, 2);
    assert.equal(fixture.calls[0].input.IfNoneMatch, '*');
    assert.equal(fixture.destroyed, 2);
  }
});
test('storage constructor other provider failures do not become conflict success', async () => {
  reset();
  fixture.response = () => { throw Error('synthetic-provider-detail'); };
  await assert.rejects(recovery.writeRestoredObject(final, payload, 'application/pdf'), /^Error: Recovery write failed\.$/);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.destroyed, 1);
});

// No optional-dependency skip: a normal CI run requires the real locked SDK.
// Local dependency-free checks may explicitly select "storage constructor".
const sdkProbe = String.raw`
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Readable } from 'node:stream';
let phase = 'dependencies';
try {
  const sdk = await import('@aws-sdk/client-s3');
  const endpoint = process.env.R2_ENDPOINT;
  const uid = '11111111-1111-4111-8111-111111111111';
  const key = 'private/' + uid + '/pending/' + uid + '.pdf';
  const body = Buffer.from('abc');
  const requests = [], clients = [];
  const handler = {
    async handle(request) {
      requests.push({
        method: request.method, hostname: request.hostname, port: request.port,
        protocol: request.protocol, path: request.path, condition: request.headers['if-none-match'],
      });
      return { response: {
        statusCode: request.method === 'DELETE' ? 204 : 200,
        headers: { 'content-length': request.method === 'GET' || request.method === 'HEAD' ? '3' : '0' },
        body: Readable.from(request.method === 'GET' ? [body] : []),
      } };
    },
    destroy() {},
  };
  globalThis.__realEndpointSdk = sdk;
  globalThis.__endpointClient = class extends sdk.S3Client {
    constructor(config) {
      // Do not override endpoint, addressing, credentials or signing.
      super({ ...config, requestHandler: handler, maxAttempts: 1 });
      clients.push(this);
    }
  };
  const names = ['GetObjectCommand','HeadObjectCommand','PutObjectCommand','DeleteObjectCommand','DeleteObjectsCommand','ListObjectsV2Command'];
  const source = 'export const S3Client = globalThis.__endpointClient;\n' +
    names.map(name => 'export const ' + name + ' = globalThis.__realEndpointSdk.' + name + ';').join('\n');
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
    if (specifier === '@/lib/mime') return { url: new URL('./lib/mime.ts', 'file://' + process.cwd() + '/').href, shortCircuit: true };
    if (specifier === '@aws-sdk/client-s3' && /\/lib\/(?:r2|crm\/recovery-storage)\.ts$/.test(context.parentURL || '')) {
      return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
    }
    return next(specifier, context);
  } });
  const r2 = await import('./lib/r2.ts');
  const recovery = await import('./lib/crm/recovery-storage.ts');
  const expected = new URL(endpoint);
  const checkRequest = (method, bucket, objectKey) => {
    const r = requests.at(-1);
    assert.equal(r.method, method);
    const origin = r.protocol + '//' + r.hostname + (r.port ? ':' + r.port : '');
    assert.equal(new URL(origin).origin, expected.origin);
    assert.equal(decodeURIComponent(r.path), '/' + bucket + '/' + objectKey);
  };
  phase = 'private-head';
  assert.equal(await r2.getPrivateObjectSize(key), 3);
  checkRequest('HEAD', 'synthetic-private', key);
  phase = 'private-get';
  assert.deepEqual(await r2.getPrivateObjectBytes(key), body);
  checkRequest('GET', 'synthetic-private', key);
  phase = 'public-put';
  await r2.putPublicObject('assets/2026/synthetic.pdf', body, 'application/pdf');
  checkRequest('PUT', 'synthetic-public', 'assets/2026/synthetic.pdf');
  phase = 'public-delete';
  await r2.deletePublicObject('assets/2026/synthetic.pdf');
  checkRequest('DELETE', 'synthetic-public', 'assets/2026/synthetic.pdf');
  phase = 'recovery-get';
  assert.deepEqual(await recovery.readRecoveryBytes(key, 3), body);
  checkRequest('GET', 'synthetic-private', key);
  phase = 'recovery-put';
  await recovery.writeRestoredObject(key, body, 'application/pdf');
  checkRequest('PUT', 'synthetic-private', key);
  assert.equal(requests.at(-1).condition, '*');
  const signed = (value, objectKey, expiry) => {
    const u = new URL(value);
    assert.equal(u.origin, expected.origin);
    assert.equal(decodeURIComponent(u.pathname), '/synthetic-private/' + objectKey);
    assert.equal(u.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
    assert.equal(u.searchParams.get('X-Amz-Expires'), String(expiry));
    assert.equal(u.searchParams.has('X-Amz-Signature'), true);
  };
  phase = 'private-presign-put';
  signed(await r2.presignPrivatePut(key, 'application/pdf', 3, 120), key, 120);
  phase = 'private-presign-get';
  signed(await r2.presignPrivateGet(key, 60), key, 60);
  phase = 'contact-presign-put';
  const contact = await r2.presignContactUpload('synthetic.pdf', 'application/pdf', 3);
  signed(contact.uploadUrl, contact.key, 600);
  assert.equal(requests.length, 6, 'Presigning must not send a request');
  for (const client of clients) client.destroy();
  hooks.deregister();
  console.log('SDK_ENDPOINT_PASS: six serialized requests and three real presigned URLs; zero network calls.');
} catch {
  console.error('SDK_ENDPOINT_FAIL: ' + phase);
  process.exitCode = 1;
}
`;
for (const [label, endpoint] of [
  ['owned DNS alias', 'http://storage:9000'],
  ['loopback IP', 'http://127.0.0.1:9000'],
  ['synthetic R2 service root', 'https://00000000000000000000000000000000.r2.cloudflarestorage.com'],
]) {
  test(`storage SDK addressing at ${label}`, () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', sdkProbe], {
      cwd: new URL('../..', import.meta.url),
      env: { ...env, R2_ENDPOINT: endpoint, AWS_EC2_METADATA_DISABLED: 'true' },
      encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
    });
    const phase = result.stderr?.match(/SDK_ENDPOINT_FAIL: [a-z-]+/)?.[0] || 'SDK probe did not finish';
    assert.equal(result.status, 0, phase);
    assert.equal(result.error, undefined);
    assert.match(result.stdout, /^SDK_ENDPOINT_PASS:/);
  });
}
