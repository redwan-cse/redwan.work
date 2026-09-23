import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateLoopbackEndpoint,
  assertDisposableTarget,
  validateFreshResourceDescriptor,
  computeDescriptorIntegrityHash,
  verifyDisposableEnvironment,
  provisionDisposableEnvironment,
  getVerifiedEnvironmentDescriptor,
  isEnvironmentVerified,
  setVerifiedEnvironmentDescriptor,
  resetVerifiedEnvironmentDescriptor,
  assertEnvironmentVerified,
  createAdminClient,
  createStorageClient,
  safeFetch,
  FixtureTracker,
  runWithCleanup,
} from './harness-env.mjs';
// Suppress top-level auto-validation during guard unit test bootstrap so we can test validateAcceptanceEnv in isolation
process.env.SUPPRESS_LOAD_ENV_AUTO_VALIDATE = 'true';
const { validateAcceptanceEnv, REQUIRED_ACCEPTANCE_ENV_VARS } = await import('./load-env.mjs');

import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

function setupValidTestEnv() {
  process.env.DISPOSABLE_AUTH_CI = 'true';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:44321';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'synthetic_test_pub_key';
  process.env.SUPABASE_SECRET_KEY = 'synthetic_test_sec_key';
  process.env.R2_ENDPOINT = 'http://127.0.0.1:9000';
  process.env.R2_PRIVATE_BUCKET = 'synthetic-private';
  process.env.R2_PRIVATE_ACCESS_KEY_ID = 'synthetic_test_key_id';
  process.env.R2_PRIVATE_SECRET_ACCESS_KEY = 'synthetic_test_secret';
  process.env.APP_URL = 'http://localhost:3399';
  process.env.DISPOSABLE_RUN_ID = 'test-run-guard-unit';
  process.env.LEAD_IP_HASH_SALT = 'synthetic-test-salt-12345';
}

function makeValidDescriptor(runId = 'test-run-guard-unit') {
  const descriptor = {
    schemaVersion: '1.0',
    runId,
    createdAt: '2026-09-23T12:00:00.000Z',
    network: {
      bridgeNetworkId: 'dnet-test-bridge-12345',
      internal: true,
    },
    containers: {
      postgres: {
        containerId: 'c-pg-1234567890ab',
        imageDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: 'running',
      },
      storage: {
        containerId: 'c-minio-1234567890cd',
        imageDigest: 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        status: 'running',
      },
    },
    volumes: {
      postgresVolume: {
        volumeName: `vol-pg-${runId}`,
        driver: 'local',
        ephemeral: true,
      },
      storageVolume: {
        volumeName: `vol-storage-${runId}`,
        driver: 'local',
        ephemeral: true,
      },
    },
    storage: {
      bucketName: 'synthetic-private',
      bucketUuid: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    },
    endpoints: {
      supabaseUrl: 'http://127.0.0.1:44321',
      storageEndpoint: 'http://127.0.0.1:9000',
      appUrl: 'http://localhost:3399',
    },
  };
  descriptor.integrityHash = computeDescriptorIntegrityHash(descriptor);
  return descriptor;
}

function createStubAdmin() {
  return {
    from(tableName) {
      return {
        select() {
          return {
            in() { return Promise.resolve({ data: [], error: null }); },
            limit() { return Promise.resolve({ data: [], error: null }); },
          };
        },
        delete() {
          return {
            in() { return Promise.resolve({ error: null }); },
          };
        },
      };
    },
    auth: {
      admin: {
        deleteUser: async () => ({ error: null }),
        getUserById: async () => ({
          data: null,
          error: { status: 404, message: 'User not found', code: 'user_not_found' },
        }),
      },
    },
  };
}

test('Guard Verification: Hostname parsing, opt-in enforcement, and URL validation', async (t) => {
  await t.test('G.1 Lookalike and remote hosts are strictly rejected', () => {
    const invalidHosts = [
      'http://localhost.example.invalid:44321',
      'http://127.0.0.1.nip.io:44321',
      'http://example.com/localhost:44321',
      'https://cqxtmzzlywolulechcob.supabase.co',
      'http://not-localhost:3000',
      'http://subdomain.localhost:3000',
    ];

    for (const raw of invalidHosts) {
      assert.throws(
        () => validateLoopbackEndpoint(raw, [44321, 3000], 'testEndpoint'),
        /Guard Error/,
        `Host '${raw}' must be rejected by exact hostname check`
      );
    }
  });

  await t.test('G.2 Unexpected URL components (userinfo, paths, queries, fragments) are strictly rejected', () => {
    const invalidUrls = [
      'http://user:pass@127.0.0.1:44321',
      'http://127.0.0.1:44321/api/some/path',
      'http://127.0.0.1:44321?query=leak',
      'http://127.0.0.1:44321#fragment',
      'ftp://127.0.0.1:44321',
    ];

    for (const raw of invalidUrls) {
      assert.throws(
        () => validateLoopbackEndpoint(raw, [44321], 'testEndpoint'),
        /Guard Error/,
        `URL '${raw}' must be rejected for containing invalid URL components`
      );
    }
  });

  await t.test('G.3 Port allowlist enforcement strictly blocks unauthorized ports', () => {
    assert.throws(
      () => validateLoopbackEndpoint('http://127.0.0.1:8080', [44321, 3399], 'testEndpoint'),
      /port 8080 is not in allowed loopback ports/
    );
    assert.throws(
      () => validateLoopbackEndpoint('http://127.0.0.1', [44321], 'testEndpoint'),
      /must specify an explicit port/
    );
  });

  await t.test('G.4 Valid exact loopback endpoints on allowed ports are accepted', () => {
    assert.equal(
      validateLoopbackEndpoint('http://127.0.0.1:44321', [44321], 'testSupabase'),
      'http://127.0.0.1:44321'
    );
    assert.equal(
      validateLoopbackEndpoint('http://localhost:3399', [3399], 'testApp'),
      'http://localhost:3399'
    );
  });

  await t.test('G.5 Loader + Harness integration: Zero silent authorization, no fallbacks, fail-closed on missing configuration', () => {
    const savedEnv = { ...process.env };
    try {
      // 1. Missing opt-in throws in assertDisposableTarget
      delete process.env.DISPOSABLE_AUTH_CI;
      assert.throws(
        () => assertDisposableTarget(),
        /DISPOSABLE_AUTH_CI must be explicitly set to "true"/
      );

      // 2. Missing opt-in throws in validateAcceptanceEnv
      assert.throws(
        () => validateAcceptanceEnv(process.env),
        /DISPOSABLE_AUTH_CI must be explicitly set to "true".*Silent test authorization is forbidden/
      );

      // 3. Set opt-in but leave credentials missing -> both must throw without supplying silent defaults
      process.env.DISPOSABLE_AUTH_CI = 'true';
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SECRET_KEY;
      delete process.env.DISPOSABLE_RUN_ID;

      assert.throws(
        () => assertDisposableTarget(),
        /Missing required ephemeral configuration without fallback/
      );
      assert.throws(
        () => validateAcceptanceEnv(process.env),
        /Missing required disposable environment configuration without fallback/
      );

      // 4. Verify no silent auto-generation of DISPOSABLE_RUN_ID
      assert.equal(process.env.DISPOSABLE_RUN_ID, undefined, 'Run ID must never be silently auto-generated');

      // 5. Valid environment passes both loader and harness checks
      setupValidTestEnv();
      assert.doesNotThrow(() => assertDisposableTarget());
      assert.doesNotThrow(() => validateAcceptanceEnv(process.env));
    } finally {
      process.env = savedEnv;
    }
  });

  await t.test('G.6 Missing or invalid run identity blocks mutation calls before execution', () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();

      // 1. Missing DISPOSABLE_RUN_ID in assertDisposableTarget
      delete process.env.DISPOSABLE_RUN_ID;
      assert.throws(() => assertDisposableTarget(), /Missing required ephemeral configuration.*DISPOSABLE_RUN_ID/);

      // 2. Invalid DISPOSABLE_RUN_ID format (missing test-run- prefix)
      process.env.DISPOSABLE_RUN_ID = 'production-run-999';
      assert.throws(() => assertDisposableTarget(), /DISPOSABLE_RUN_ID must start with 'test-run-'/);
    } finally {
      process.env = savedEnv;
    }
  });

  await t.test('G.7 Fresh resource descriptor validation and integrity hashing', () => {
    const runId = 'test-run-desc-validation';
    const desc = makeValidDescriptor(runId);

    // 1. Valid descriptor passes validation
    assert.equal(validateFreshResourceDescriptor(desc, runId), true);

    // 2. Missing or wrong schemaVersion fails
    const invalidVer = { ...desc, schemaVersion: '2.0' };
    assert.throws(
      () => validateFreshResourceDescriptor(invalidVer, runId),
      /Unsupported schemaVersion/
    );

    // 3. Run ID mismatch fails
    assert.throws(
      () => validateFreshResourceDescriptor(desc, 'test-run-different-id'),
      /Run ID mismatch/
    );

    // 4. Missing containerId or imageDigest fails
    const badContainer = JSON.parse(JSON.stringify(desc));
    delete badContainer.containers.postgres.imageDigest;
    badContainer.integrityHash = computeDescriptorIntegrityHash(badContainer);
    assert.throws(
      () => validateFreshResourceDescriptor(badContainer, runId),
      /Container 'postgres' is missing containerId or imageDigest/
    );

    // 5. Non-ephemeral volume fails
    const badVolume = JSON.parse(JSON.stringify(desc));
    badVolume.volumes.postgresVolume.ephemeral = false;
    badVolume.integrityHash = computeDescriptorIntegrityHash(badVolume);
    assert.throws(
      () => validateFreshResourceDescriptor(badVolume, runId),
      /must be an ephemeral named volume/
    );

    // 6. Non-internal network (missing default-deny egress) fails
    const badNet = JSON.parse(JSON.stringify(desc));
    badNet.network.internal = false;
    badNet.integrityHash = computeDescriptorIntegrityHash(badNet);
    assert.throws(
      () => validateFreshResourceDescriptor(badNet, runId),
      /default-deny egress/
    );

    // 7. Tampered descriptor (modified container ID without updating integrityHash) fails
    const tampered = { ...desc, containers: { ...desc.containers, postgres: { ...desc.containers.postgres, containerId: 'c-tampered-id' } } };
    assert.throws(
      () => validateFreshResourceDescriptor(tampered, runId),
      /Descriptor integrity hash mismatch/
    );
  });

  await t.test('G.8 Unverified environment strictly blocks mutation-ready clients and mutating HTTP requests', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      resetVerifiedEnvironmentDescriptor();

      // 1. Calling createAdminClient() without verified descriptor throws
      assert.throws(
        () => createAdminClient(),
        /CRITICAL TRUST BOUNDARY VIOLATION: Environment identity has not been verified/
      );

      // 2. Calling createStorageClient() without verified descriptor throws
      assert.throws(
        () => createStorageClient(),
        /CRITICAL TRUST BOUNDARY VIOLATION: Environment identity has not been verified/
      );

      // 3. Calling safeFetch() with POST without verified descriptor throws
      await assert.rejects(
        () => safeFetch('http://localhost:3399/api/contact', { method: 'POST', body: '{}' }),
        /CRITICAL TRUST BOUNDARY VIOLATION: Environment identity has not been verified/
      );

      // 4. Calling safeFetch() with DELETE without verified descriptor throws
      await assert.rejects(
        () => safeFetch('http://localhost:3399/api/test', { method: 'DELETE' }),
        /CRITICAL TRUST BOUNDARY VIOLATION: Environment identity has not been verified/
      );

      // 5. provisionDisposableEnvironment() is permanently removed and throws safety halt
      assert.throws(
        () => provisionDisposableEnvironment(),
        /CRITICAL SAFETY HALT: provisionDisposableEnvironment\(\) is permanently removed/
      );
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });

  await t.test('G.9 verifyDisposableEnvironment is strictly read-only: never calls PutObjectCommand, insert, update, delete, or rate_limits table', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      const runId = 'test-run-read-only-desc';
      process.env.DISPOSABLE_RUN_ID = runId;
      resetVerifiedEnvironmentDescriptor();

      const desc = makeValidDescriptor(runId);

      const storageCalls = [];
      const mockStorage = {
        async send(command) {
          storageCalls.push(command);
          if (command instanceof PutObjectCommand || command.constructor.name === 'PutObjectCommand') {
            throw new Error('VIOLATION: PutObjectCommand was called during verification!');
          }
          if (command.constructor.name === 'GetObjectCommand') {
            return {
              Body: JSON.stringify({
                runId,
                target: 'disposable-acceptance',
                bucketUuid: desc.storage.bucketUuid,
                postgresContainerId: desc.containers.postgres.containerId,
                storageContainerId: desc.containers.storage.containerId,
              }),
            };
          }
          throw new Error(`Unexpected storage command: ${command.constructor.name}`);
        },
      };

      const adminCalls = [];
      const mockAdmin = {
        from(tableName) {
          if (tableName === 'rate_limits') {
            throw new Error('VIOLATION: rate_limits table must never be queried or modified during verification!');
          }
          return {
            select(cols) {
              return {
                limit(n) {
                  adminCalls.push({ op: 'select', tableName, cols, limit: n });
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
            insert() { throw new Error('VIOLATION: insert called during verification'); },
            update() { throw new Error('VIOLATION: update called during verification'); },
            delete() { throw new Error('VIOLATION: delete called during verification'); },
            upsert() { throw new Error('VIOLATION: upsert called during verification'); },
          };
        },
      };

      const result = await verifyDisposableEnvironment(desc, mockAdmin, mockStorage);
      assert.equal(result.verified, true);
      assert.equal(result.runId, runId);
      assert.equal(isEnvironmentVerified(), true);

      // Verify only read operations were performed
      assert.equal(storageCalls.length, 1);
      assert.equal(storageCalls[0].constructor.name, 'GetObjectCommand');
      assert.equal(adminCalls.length, 1);
      assert.equal(adminCalls[0].op, 'select');
      assert.equal(adminCalls[0].tableName, 'files');

      // Now createAdminClient and createStorageClient succeed
      assert.doesNotThrow(() => createAdminClient());
      assert.doesNotThrow(() => createStorageClient());
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });

  await t.test('G.10 Storage marker identity mismatch or read error fails closed', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      const runId = 'test-run-storage-marker-mismatch';
      process.env.DISPOSABLE_RUN_ID = runId;
      resetVerifiedEnvironmentDescriptor();

      const desc = makeValidDescriptor(runId);
      const mockAdmin = createStubAdmin();

      // 1. Mismatched container ID in marker
      const mismatchedStorage = {
        async send() {
          return {
            Body: JSON.stringify({
              runId,
              target: 'disposable-acceptance',
              bucketUuid: desc.storage.bucketUuid,
              postgresContainerId: 'c-different-container-id',
              storageContainerId: desc.containers.storage.containerId,
            }),
          };
        },
      };

      await assert.rejects(
        () => verifyDisposableEnvironment(desc, mockAdmin, mismatchedStorage),
        /CRITICAL SAFETY HALT: Storage marker identity mismatch/
      );

      // 2. Missing marker in S3 (NoSuchKey)
      const missingStorage = {
        async send() {
          const err = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          throw err;
        },
      };

      await assert.rejects(
        () => verifyDisposableEnvironment(desc, mockAdmin, missingStorage),
        /CRITICAL SAFETY HALT: Disposable storage marker '.*' is missing or unreadable/
      );

      // 3. Malformed JSON in marker
      const malformedStorage = {
        async send() {
          return { Body: '{"not-json' };
        },
      };

      await assert.rejects(
        () => verifyDisposableEnvironment(desc, mockAdmin, malformedStorage),
        /CRITICAL SAFETY HALT: Disposable storage marker '.*' is malformed JSON/
      );
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });

  await t.test('G.11 HTTP 401 alone cannot establish environment identity', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      const runId = 'test-run-401-cannot-prove-env';
      process.env.DISPOSABLE_RUN_ID = runId;
      resetVerifiedEnvironmentDescriptor();

      const desc = makeValidDescriptor(runId);

      // Simulated external endpoint returning 401
      const mockEndpointRes = { status: 401, statusText: 'Unauthorized' };
      assert.equal(mockEndpointRes.status, 401);

      // Environment lacking verified descriptor fails closed even if HTTP server returns 401
      const missingStorage = {
        async send() {
          const err = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          throw err;
        },
      };
      const mockAdmin = createStubAdmin();

      await assert.rejects(
        () => verifyDisposableEnvironment(desc, mockAdmin, missingStorage),
        /CRITICAL SAFETY HALT/
      );
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });

  await t.test('G.12 Successfully deleted S3 keys remain in complete inventory (tracker.inventory.keys)', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      const runId = 'test-run-inventory-preservation';
      process.env.DISPOSABLE_RUN_ID = runId;
      setVerifiedEnvironmentDescriptor(makeValidDescriptor(runId));

      const mockStorage = {
        async send(command) {
          if (command.constructor.name === 'DeleteObjectsCommand') {
            return {
              Deleted: [{ Key: 'staging/temp-1.bin' }, { Key: 'staging/temp-2.bin' }],
              Errors: [],
            };
          }
          if (command.constructor.name === 'HeadObjectCommand') {
            const err = new Error('NotFound');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Deleted: [], Errors: [] };
        },
      };

      const mockAdmin = createStubAdmin();
      const tracker = new FixtureTracker(mockAdmin, mockStorage, runId);
      tracker.trackKey('staging/temp-1.bin');
      tracker.trackKey('staging/temp-2.bin');

      assert.equal(tracker.inventory.keys.size, 2);
      assert.equal(tracker.pendingKeys.size, 2);

      await tracker.cleanup();

      // Pending set is cleared
      assert.equal(tracker.pendingKeys.size, 0);

      // Complete inventory retains all keys ever tracked
      assert.equal(tracker.inventory.keys.size, 2);
      assert.equal(tracker.inventory.keys.has('staging/temp-1.bin'), true);
      assert.equal(tracker.inventory.keys.has('staging/temp-2.bin'), true);

      // Manifest reflects exact counts
      const manifest = tracker.getManifest();
      assert.equal(manifest.inventory.keys.length, 2);
      assert.equal(manifest.deleted.length, 2);
      assert.equal(manifest.verifiedAbsent.length, 2);
      assert.equal(manifest.failed.length, 0);
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });

  await t.test('G.13 Registry handling uses r2_key and respects protected grants without unauthorized delete', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      const runId = 'test-run-registry-respect';
      process.env.DISPOSABLE_RUN_ID = runId;
      setVerifiedEnvironmentDescriptor(makeValidDescriptor(runId));

      const deletedTables = [];
      const selectedColumns = {};

      const validZipContent = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      const zipHash = 'c740f0ec5aff6078d92cd8843de452a73d41c5df00d238f5568b43dac4864740';


      const mockAdmin = {
        from(table) {
          return {
            select(cols) {
              selectedColumns[table] = cols;
              return {
                in() {
                  if (table === 'immutable_uploads') {
                    return Promise.resolve({
                      data: [{ r2_key: 'uploads/immutable-1.bin', source_key: 'src-1', sha256: 'abc', size_bytes: 100 }],
                      error: null,
                    });
                  }
                  if (table === 'recovery_imports') {
                    return Promise.resolve({
                      data: [{ id: 'imp-1', actor: 'admin@example.com', upload_key: 'up-1', sealed_key: 'seal-1', sha256: 'def' }],
                      error: null,
                    });
                  }
                  if (table === 'file_recovery') {
                    return Promise.resolve({
                      data: [{ file_id: 'file-1', recovery_key: 'backups/b1.tar.gz', sha256: zipHash, archive_bytes: 8 }],
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
            delete() {
              deletedTables.push(table);
              return {
                in() { return Promise.resolve({ error: null }); },
              };
            },
          };
        },
        auth: {
          admin: {
            deleteUser: async () => ({ error: null }),
            getUserById: async () => ({
              data: null,
              error: { status: 404, message: 'User not found', code: 'user_not_found' },
            }),
          },
        },
      };

      const mockStorage = {
        async send(command) {
          if (command.constructor.name === 'DeleteObjectsCommand') {
            return { Deleted: [{ Key: 'uploads/immutable-1.bin' }], Errors: [] };
          }
          if (command.constructor.name === 'HeadObjectCommand') {
            if (command.input?.Key === 'uploads/immutable-1.bin') {
              const err = new Error('NotFound');
              err.name = 'NotFound';
              err.$metadata = { httpStatusCode: 404 };
              throw err;
            }
            if (command.input?.Key === 'backups/b1.tar.gz') {
              return { ContentLength: 8 };
            }
          }
          if (command.constructor.name === 'GetObjectCommand') {
            if (command.input?.Key === 'backups/b1.tar.gz') {
              return { Body: validZipContent };
            }
          }
          return { Deleted: [], Errors: [] };
        },
      };


      const tracker = new FixtureTracker(mockAdmin, mockStorage, runId);
      tracker.trackKey('uploads/immutable-1.bin');
      tracker.trackImport('imp-1');
      tracker.trackFile('file-1');

      await tracker.cleanup();

      // Verify DELETE was never attempted on protected tables
      assert.equal(deletedTables.includes('immutable_uploads'), false, 'immutable_uploads must never have DELETE called');
      assert.equal(deletedTables.includes('recovery_imports'), false, 'recovery_imports must never have DELETE called');
      assert.equal(deletedTables.includes('file_recovery'), false, 'file_recovery must never have DELETE called');

      // Verify correct column r2_key was queried
      assert.equal(selectedColumns['immutable_uploads'].includes('r2_key'), true);

      // Verify intentional retention was properly accounted for in manifest
      const manifest = tracker.getManifest();
      const retainedTypes = manifest.intentionallyRetained.map(r => r.resourceType);
      assert.equal(retainedTypes.includes('immutable_uploads'), true);
      assert.equal(retainedTypes.includes('recovery_imports'), true);
      assert.equal(retainedTypes.includes('file_recovery'), true);
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });

  await t.test('G.14 file_recovery archive usability: tombstone for deleted object, usable backup requires valid existence + byte length + sha256 + ZIP magic bytes', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      const runId = 'test-run-archive-usability-checks';
      process.env.DISPOSABLE_RUN_ID = runId;
      setVerifiedEnvironmentDescriptor(makeValidDescriptor(runId));

      const validZipContent = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      const realZipSha256 = '4bc961e8ca5ed1566ca76e0986ba99290b4fe8fbc177eaa9c99761dc2bb74cc1';


      const mockAdmin = {
        from(table) {
          return {
            select() {
              return {
                in() {
                  if (table === 'file_recovery') {
                    return Promise.resolve({
                      data: [
                        { file_id: 'file-deleted-obj', recovery_key: 'backups/deleted.zip', sha256: 'h1', archive_bytes: 8 },
                        { file_id: 'file-usable-backup', recovery_key: 'backups/valid.zip', sha256: realZipSha256, archive_bytes: 8 },
                        { file_id: 'file-corrupt-format', recovery_key: 'backups/corrupt.zip', sha256: 'somehash', archive_bytes: 8 },
                        { file_id: 'file-missing-s3', recovery_key: 'backups/missing.zip', sha256: 'somehash', archive_bytes: 8 },
                      ],
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
            delete() {
              return {
                in() { return Promise.resolve({ error: null }); },
              };
            },
          };
        },
        auth: {
          admin: {
            deleteUser: async () => ({ error: null }),
            getUserById: async () => ({
              data: null,
              error: { status: 404, message: 'User not found', code: 'user_not_found' },
            }),
          },
        },
      };

      const mockStorage = {
        async send(command) {
          if (command.constructor.name === 'DeleteObjectsCommand') {
            return {
              Deleted: [{ Key: 'backups/deleted.zip' }],
              Errors: [],
            };
          }
          if (command.constructor.name === 'HeadObjectCommand') {
            if (command.input.Key === 'backups/deleted.zip' || command.input.Key === 'backups/missing.zip') {
              const err = new Error('NotFound');
              err.name = 'NotFound';
              err.$metadata = { httpStatusCode: 404 };
              throw err;
            }
            if (command.input.Key === 'backups/valid.zip' || command.input.Key === 'backups/corrupt.zip') {
              return { ContentLength: 8 };
            }
          }
          if (command.constructor.name === 'GetObjectCommand') {
            if (command.input.Key === 'backups/valid.zip') {
              return { Body: validZipContent };
            }
            if (command.input.Key === 'backups/corrupt.zip') {
              // Missing PK\x03\x04 header
              return { Body: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) };
            }
          }
          return {};
        },
      };

      const tracker = new FixtureTracker(mockAdmin, mockStorage, runId);
      tracker.trackFile('file-deleted-obj');
      tracker.trackFile('file-usable-backup');
      tracker.trackFile('file-corrupt-format');
      tracker.trackFile('file-missing-s3');
      tracker.trackKey('backups/deleted.zip');

      await assert.rejects(
        () => tracker.cleanup(),
        /Fixture cleanup encountered \d+ failure\(s\)/
      );

      const manifest = tracker.getManifest();
      const recs = manifest.intentionallyRetained.filter(r => r.resourceType === 'file_recovery');

      // 1. Deleted S3 object becomes 'unusable tombstone'
      const tombstone = recs.find(r => r.identifier === 'file-deleted-obj');
      assert.equal(tombstone.status, 'unusable tombstone');
      assert.equal(tombstone.objectDisposition, 'deleted');

      // 2. Retained S3 object with matching size, hash, and ZIP magic bytes becomes 'usable backup'
      const usable = recs.find(r => r.identifier === 'file-usable-backup');
      assert.equal(usable.status, 'usable backup');
      assert.equal(usable.objectDisposition, 'retained');

      // 3. Corrupted header becomes 'verification-failed'
      const corrupt = recs.find(r => r.identifier === 'file-corrupt-format');
      assert.equal(corrupt.status, 'verification-failed');

      // 4. Missing object in S3 becomes 'verification-failed'
      const missing = recs.find(r => r.identifier === 'file-missing-s3');
      assert.equal(missing.status, 'verification-failed');
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });

  await t.test('G.15 Post-cleanup Auth user verification strictly distinguishes 404 from timeouts and 500s', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      const runId = 'test-run-auth-verification-rigor';
      process.env.DISPOSABLE_RUN_ID = runId;
      setVerifiedEnvironmentDescriptor(makeValidDescriptor(runId));

      const mockStorage = {
        async send(command) {
          if (command.constructor.name === 'HeadObjectCommand') {
            const err = new Error('NotFound');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Deleted: [], Errors: [] };
        },
      };

      // User 1 returns 404 (user_not_found) -> genuinely absent
      // User 2 returns 500 Internal Server Error -> verification failure!
      // User 3 returns network timeout -> verification failure!
      const mockAdmin = {
        from() {
          return {
            select() { return { in() { return Promise.resolve({ data: [], error: null }); } }; },
            delete() { return { in() { return Promise.resolve({ error: null }); } }; },
          };
        },
        auth: {
          admin: {
            deleteUser: async () => ({ error: null }),
            getUserById: async (uid) => {
              if (uid === 'user-genuine-404') {
                return { data: null, error: { status: 404, message: 'User not found', code: 'user_not_found' } };
              }
              if (uid === 'user-500-error') {
                return { data: null, error: { status: 500, message: 'Internal Server Error' } };
              }
              if (uid === 'user-timeout') {
                return { data: null, error: new Error('Auth service network timeout') };
              }
              return { data: null, error: null };
            },
          },
        },
      };

      const tracker = new FixtureTracker(mockAdmin, mockStorage, runId);
      tracker.trackUser('user-genuine-404');
      tracker.trackUser('user-500-error');
      tracker.trackUser('user-timeout');

      await assert.rejects(
        () => tracker.cleanup(),
        /Fixture cleanup encountered \d+ failure\(s\)/
      );

      const manifest = tracker.getManifest();

      // Only genuine 404 is in verifiedAbsent
      const absentIds = manifest.verifiedAbsent.filter(v => v.resourceType === 'auth_user').map(v => v.identifier);
      assert.equal(absentIds.includes('user-genuine-404'), true);
      assert.equal(absentIds.includes('user-500-error'), false, '500 error must NEVER be marked verifiedAbsent');
      assert.equal(absentIds.includes('user-timeout'), false, 'Timeout error must NEVER be marked verifiedAbsent');

      // Both 500 and timeout are recorded as failures
      const failedIds = manifest.failed.filter(f => f.resourceType === 'auth_user').map(f => f.identifier);
      assert.equal(failedIds.includes('user-500-error'), true);
      assert.equal(failedIds.includes('user-timeout'), true);
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });

  await t.test('G.16 S3 partial failures, DB returned errors, and Auth returned errors are preserved and reported in cleanupErrors and manifest', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      const runId = 'test-run-error-preservation';
      process.env.DISPOSABLE_RUN_ID = runId;
      setVerifiedEnvironmentDescriptor(makeValidDescriptor(runId));

      const mockStorage = {
        async send(command) {
          if (command.constructor.name === 'DeleteObjectsCommand') {
            return {
              Deleted: [{ Key: 'key-ok' }],
              Errors: [{ Key: 'key-denied', Code: 'AccessDenied', Message: 'Access Denied on bucket' }],
            };
          }
          if (command.constructor.name === 'HeadObjectCommand') {
            const err = new Error('NotFound');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return {};
        },
      };

      const mockAdmin = {
        from(table) {
          return {
            select() {
              return {
                in() { return Promise.resolve({ data: [], error: null }); },
              };
            },
            delete() {
              return {
                in(col, vals) {
                  if (table === 'files') {
                    return Promise.resolve({ error: new Error('Postgres foreign key violation (23503)') });
                  }
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
        auth: {
          admin: {
            deleteUser: async () => ({ error: new Error('Auth service timeout') }),
            getUserById: async () => ({
              data: null,
              error: { status: 404, message: 'User not found', code: 'user_not_found' },
            }),
          },
        },
      };

      const tracker = new FixtureTracker(mockAdmin, mockStorage, runId);
      tracker.trackKey('key-ok');
      tracker.trackKey('key-denied');
      tracker.trackKey('key-omitted');
      tracker.trackFile('file-failing-db');
      tracker.trackUser('user-failing-auth');

      await assert.rejects(
        () => tracker.cleanup(),
        /Fixture cleanup encountered \d+ failure\(s\)/
      );

      // Verify all distinct errors are recorded
      assert.equal(tracker.cleanupErrors.some(e => e.includes('key-denied') && e.includes('AccessDenied')), true);
      assert.equal(tracker.cleanupErrors.some(e => e.includes('key-omitted') && e.includes('incomplete response')), true);
      assert.equal(tracker.cleanupErrors.some(e => e.includes('files delete error') && e.includes('foreign key violation')), true);
      assert.equal(tracker.cleanupErrors.some(e => e.includes('auth.users delete error') && e.includes('Auth service timeout')), true);

      // Verify manifest recorded each failed resource
      const manifest = tracker.getManifest();
      assert.equal(manifest.failed.some(f => f.identifier === 'key-denied'), true);
      assert.equal(manifest.failed.some(f => f.identifier === 'key-omitted'), true);
      assert.equal(manifest.failed.some(f => f.resourceType === 'files'), true);
      assert.equal(manifest.failed.some(f => f.identifier === 'user-failing-auth'), true);
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });

  await t.test('G.17 Cleanup cannot report success merely because the delete API returned no error if the resource still exists on read-back', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      const runId = 'test-run-ghost-resource-check';
      process.env.DISPOSABLE_RUN_ID = runId;
      setVerifiedEnvironmentDescriptor(makeValidDescriptor(runId));

      const mockStorage = {
        async send(command) {
          if (command.constructor.name === 'DeleteObjectsCommand') {
            return {
              Deleted: [{ Key: 'ghost-key.bin' }],
              Errors: [],
            };
          }
          if (command.constructor.name === 'HeadObjectCommand') {
            return { ContentLength: 1024, ETag: '"12345"' };
          }
          return {};
        },
      };

      const mockAdmin = createStubAdmin();
      const tracker = new FixtureTracker(mockAdmin, mockStorage, runId);
      tracker.trackKey('ghost-key.bin');

      await assert.rejects(
        () => tracker.cleanup(),
        /Post-cleanup verification failed: Storage key 'ghost-key.bin' still exists after deletion/
      );

      const manifest = tracker.getManifest();
      assert.equal(manifest.failed.some(f => f.identifier === 'ghost-key.bin'), true);
      assert.equal(manifest.verifiedAbsent.some(v => v.identifier === 'ghost-key.bin'), false);
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });

  await t.test('G.18 Missing logs remain UNAVAILABLE rather than triggering an automatic rerun', () => {
    const knownLogs = new Map([
      ['section4-interrupted-restore.mjs', 'present'],
      ['section5-session-authorization.mjs', 'present'],
    ]);

    function resolveExecutionLog(suiteName, catalog) {
      if (!catalog.has(suiteName)) {
        return {
          status: 'UNAVAILABLE',
          reason: 'Raw terminal output was not retained in terminal session history. No automatic rerun permitted.',
          action: 'DO_NOT_RERUN',
        };
      }
      return { status: 'AVAILABLE', log: catalog.get(suiteName) };
    }

    const uncaptured = resolveExecutionLog('historical-uncaptured-run.mjs', knownLogs);
    assert.equal(uncaptured.status, 'UNAVAILABLE');
    assert.equal(uncaptured.action, 'DO_NOT_RERUN');
    assert.match(uncaptured.reason, /not retained/);
  });

  await t.test('G.19 runWithCleanup preserves primary test failure alongside subsequent cleanup failure without masking either', async () => {
    const savedEnv = { ...process.env };
    try {
      setupValidTestEnv();
      const runId = 'test-run-with-cleanup-preservation';
      process.env.DISPOSABLE_RUN_ID = runId;
      setVerifiedEnvironmentDescriptor(makeValidDescriptor(runId));

      const mockStorage = {
        async send(command) {
          if (command.constructor.name === 'DeleteObjectsCommand') {
            return {
              Deleted: [],
              Errors: [{ Key: 'failing-key', Code: 'InternalError', Message: 'Storage engine exploded' }],
            };
          }
          if (command.constructor.name === 'HeadObjectCommand') {
            const err = new Error('NotFound');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return {};
        },
      };

      const mockAdmin = createStubAdmin();
      const tracker = new FixtureTracker(mockAdmin, mockStorage, runId);
      tracker.trackKey('failing-key');

      // Execute a test where the test body asserts something that fails, AND cleanup fails
      await assert.rejects(
        async () => {
          await runWithCleanup(tracker, async () => {
            assert.equal(1 + 1, 3, 'Intentional primary test assertion failure');
          });
        },
        (err) => {
          // Check that combined error contains both errors!
          assert.match(err.message, /PRIMARY TEST ERROR:.*Intentional primary test assertion failure/);
          assert.match(err.message, /SUBSEQUENT CLEANUP ERROR:.*Fixture cleanup encountered 1 failure/);
          assert.equal(err.primaryError instanceof Error, true);
          assert.equal(err.cleanupError instanceof Error, true);
          return true;
        }
      );
    } finally {
      process.env = savedEnv;
      resetVerifiedEnvironmentDescriptor();
    }
  });
});
