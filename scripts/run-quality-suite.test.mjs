import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveReceiptFromVitestJson,
  deriveReceiptFromPlaywrightJson,
} from './run-quality-suite.mjs';

const unitSuite = {
  id: 'unit',
  requirements: ['CONSENT-CONTRACT', 'RATE-LIMIT-KINDS'],
};

const e2eSuite = {
  id: 'e2e',
  requirements: ['R1-ORDER-DELIVER-PAY', 'OUTBOX-RETRY'],
};

const sampleCommit = 'a'.repeat(40);

test('deriveReceiptFromVitestJson extracts counts and only passing requirement tags', () => {
  const raw = {
    testResults: [
      {
        status: 'passed',
        assertionResults: [
          {
            fullName: '[CONSENT-CONTRACT] validates canonical bundle',
            title: 'validates canonical bundle',
            status: 'passed',
          },
          {
            fullName: '[RATE-LIMIT-KINDS] rejects unknown kind',
            title: 'rejects unknown kind',
            status: 'failed',
          },
          {
            fullName: 'skipped check',
            title: 'skipped check',
            status: 'skipped',
          },
        ],
      },
    ],
  };

  const receipt = deriveReceiptFromVitestJson(raw, unitSuite, sampleCommit);
  assert.equal(receipt.passed, 1);
  assert.equal(receipt.failed, 1);
  assert.equal(receipt.skipped, 1);
  assert.deepEqual(receipt.coveredRequirements, ['CONSENT-CONTRACT']);
});

test('deriveReceiptFromPlaywrightJson walks nested suites and extracts expected tags only', () => {
  const raw = {
    suites: [
      {
        title: 'tests/e2e/order-journey.spec.ts',
        suites: [
          {
            title: '[R1-ORDER-DELIVER-PAY] complete quote to settlement flow',
            specs: [
              {
                title: 'completes full client-admin journey',
                tests: [{ status: 'expected' }],
              },
            ],
          },
          {
            title: '[OUTBOX-RETRY] email worker retry',
            specs: [
              {
                title: 'retries transient 500 once',
                tests: [{ status: 'unexpected' }],
              },
            ],
          },
        ],
      },
    ],
  };

  const receipt = deriveReceiptFromPlaywrightJson(raw, e2eSuite, sampleCommit);
  assert.equal(receipt.passed, 1);
  assert.equal(receipt.failed, 1);
  assert.equal(receipt.skipped, 0);
  assert.deepEqual(receipt.coveredRequirements, ['R1-ORDER-DELIVER-PAY']);
});
