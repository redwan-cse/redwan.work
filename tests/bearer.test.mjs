import assert from 'node:assert/strict';
import test from 'node:test';
import { requireBearer } from '../lib/auth/bearer.ts';

// Deliberately synthetic fixtures, never production credentials.
const token = 'synthetic-ci-fixture';

test('accepts an exact bearer credential', () => {
  assert.equal(requireBearer(token, `Bearer ${token}`), true);
});

test('fails closed when configuration is missing or empty', () => {
  for (const secret of [undefined, '']) {
    assert.equal(requireBearer(secret, `Bearer ${token}`), false);
  }
});

test('rejects missing, empty and malformed authorization headers', () => {
  for (const header of [null, '', 'Bearer', 'Bearer ', `Basic ${token}`, ` Bearer ${token}`, `Bearer ${token} `]) {
    assert.equal(requireBearer(token, header), false);
  }
});

test('rejects same-length and different-length mismatches without throwing', () => {
  for (const candidate of ['synthetic-ci-fixturf', 'short', `${token}-longer`]) {
    assert.equal(requireBearer(token, `Bearer ${candidate}`), false);
  }
});

test('compares UTF-8 byte lengths safely', () => {
  assert.equal(requireBearer('é', 'Bearer é'), true);
  assert.equal(requireBearer('é', 'Bearer e'), false);
  assert.equal(requireBearer('é', 'Bearer ab'), false);
});
