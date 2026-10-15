import assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import {registerHooks} from 'node:module';
import test, {after} from 'node:test';

// Use the real lockfile-installed AWS client and presigner. No storage request,
// hosted credentials, browser CORS claim or production upload belongs here.
const syntheticEnvironment = {
  R2_ENDPOINT: 'https://storage.example.test',
  R2_PUBLIC_BUCKET: 'public-fixtures',
  R2_PUBLIC_ACCESS_KEY_ID: 'synthetic-access',
  R2_PUBLIC_SECRET_ACCESS_KEY: 'synthetic-secret-not-a-credential',
  NEXT_PUBLIC_R2_PUBLIC_BASE_URL: 'https://cdn.example.test',
  AWS_REQUEST_CHECKSUM_CALCULATION: 'WHEN_SUPPORTED',
};
const originalEnvironment = new Map(
  Object.keys(syntheticEnvironment).map(key => [key, process.env[key]]),
);
Object.assign(process.env, syntheticEnvironment);
after(() => {
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') {
      return {url: 'data:text/javascript,export {};', shortCircuit: true};
    }
    if (specifier === '@/lib/r2' || specifier === '@/lib/mime') {
      return {
        url: new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});
let preparePublicAsset;
try {
  ({preparePublicAsset} = await import('../../lib/r2-public-upload.ts'));
} finally {
  hooks.deregister();
}

const metadata = {filename: 'fixture.png', mime: 'image/png', size: 11};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encode = value => encodeURIComponent(value).replace(
  /[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
);

// An independent, fixture-only SigV4 check. It validates the emitted signature,
// not R2's implementation, browser behavior or the integrity of stored bytes.
function signatureMatches(url, headers) {
  const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders');
  const credential = url.searchParams.get('X-Amz-Credential');
  assert.ok(signedHeaders && credential, 'The signer must emit SigV4 metadata');
  const [, date, region, service, terminator] = credential.split('/');
  assert.equal(terminator, 'aws4_request');
  const canonicalHeaders = signedHeaders.split(';').map(name => {
    assert.equal(typeof headers[name], 'string', 'All signed headers must be supplied');
    return `${name}:${headers[name].trim().replace(/\s+/g, ' ')}\n`;
  }).join('');
  const canonicalQuery = [...url.searchParams]
    .filter(([key]) => key !== 'X-Amz-Signature')
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([ak, av], [bk, bv]) => ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('&');
  const canonicalRequest = [
    'PUT', url.pathname, canonicalQuery, canonicalHeaders,
    signedHeaders, 'UNSIGNED-PAYLOAD',
  ].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', url.searchParams.get('X-Amz-Date'), scope, sha256(canonicalRequest),
  ].join('\n');
  const dateKey = hmac(`AWS4${syntheticEnvironment.R2_PUBLIC_SECRET_ACCESS_KEY}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(hmac(serviceKey, 'aws4_request'), stringToSign).toString('hex') ===
    url.searchParams.get('X-Amz-Signature');
}

for (const size of [1, 5242880]) {
  test(`public asset presign does not bind an empty-body checksum for ${size} bytes`, async () => {
    const prepared = await preparePublicAsset({...metadata, size});
    const url = new URL(prepared.uploadUrl);
    const checksumKeys = [...url.searchParams.keys()].filter(
      key => /^x-amz-(?:checksum|sdk-checksum)/i.test(key),
    );
    assert.deepEqual(checksumKeys, [], 'Metadata-only signing cannot checksum the future file');
    assert.equal(url.searchParams.get('X-Amz-Content-Sha256'), 'UNSIGNED-PAYLOAD');
  });
}

 test('public asset signature binds both content type and exact byte count', async () => {
  const {uploadUrl} = await preparePublicAsset(metadata);
  const url = new URL(uploadUrl);
  const headers = {
    host: url.host, 'content-type': metadata.mime, 'content-length': String(metadata.size),
  };
  assert.equal(signatureMatches(url, headers), true, 'The fixture request must have a valid signature');
  assert.equal(signatureMatches(url, {...headers, 'content-type': 'text/html'}), false,
    'A changed type must invalidate the signature before confirmation');
  assert.equal(signatureMatches(url, {...headers, 'content-length': '12'}), false,
    'A changed size must invalidate the signature before confirmation');
});

 test('public asset presign retains endpoint bucket namespace and ten-minute expiry', async () => {
  const prepared = await preparePublicAsset(metadata);
  const url = new URL(prepared.uploadUrl);
  assert.equal(url.origin, syntheticEnvironment.R2_ENDPOINT);
  assert.equal(url.pathname, `/${syntheticEnvironment.R2_PUBLIC_BUCKET}/${prepared.key}`);
  assert.match(prepared.key, /^assets\/\d{4}\/[0-9a-f]{32}\.png$/);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '600');
  assert.equal(url.searchParams.get('x-id'), 'PutObject');
});

 test('public asset signing normalizes MIME before binding it', async () => {
  const {uploadUrl} = await preparePublicAsset({...metadata, mime: ' IMAGE/PNG; charset=utf-8 '});
  const url = new URL(uploadUrl);
  assert.equal(signatureMatches(url, {
    host: url.host, 'content-type': 'image/png', 'content-length': String(metadata.size),
  }), true);
});

 test('public asset signing rejects invalid metadata without issuing a URL', async () => {
  for (const input of [
    null, {...metadata, size: 0}, {...metadata, size: 5242881},
    {...metadata, size: 1.5}, {...metadata, mime: 'text/html'},
    {...metadata, filename: 'fixture.exe'},
  ]) {
    await assert.rejects(() => preparePublicAsset(input), /Invalid asset metadata/);
  }
});
