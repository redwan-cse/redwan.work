import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { S3Client, DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

/**
 * Validates that an endpoint is strictly an exact loopback address on an allowed port
 * with no path components, userinfo, query strings, or fragments.
 */
export function validateLoopbackEndpoint(rawUrl, allowedPorts, name) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error(`Guard Error: ${name} is missing or not a string.`);
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Guard Error: ${name} is not a valid URL: ${rawUrl}`);
  }

  // Protocol must be strictly http:
  if (parsed.protocol !== 'http:') {
    throw new Error(`Guard Error: ${name} protocol must be http:, received '${parsed.protocol}'`);
  }

  // Exact loopback hostname check (prevents localhost.example.com, 127.0.0.1.nip.io, etc.)
  const EXACT_LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!EXACT_LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`Guard Error: ${name} hostname must be exact loopback (127.0.0.1, localhost, ::1). Received: '${parsed.hostname}'`);
  }

  // Explicit port check
  if (!parsed.port) {
    throw new Error(`Guard Error: ${name} must specify an explicit port.`);
  }
  const portNum = parseInt(parsed.port, 10);
  if (allowedPorts && allowedPorts.length > 0 && !allowedPorts.includes(portNum)) {
    throw new Error(`Guard Error: ${name} port ${portNum} is not in allowed loopback ports: ${allowedPorts.join(', ')}`);
  }

  // Pathname must be strictly empty or '/'
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(`Guard Error: ${name} must not contain path components, got: '${parsed.pathname}'`);
  }

  // Reject embedded userinfo, query parameters, or hash fragments
  if (parsed.username || parsed.password) {
    throw new Error(`Guard Error: ${name} must not contain embedded user credentials.`);
  }
  if (parsed.search) {
    throw new Error(`Guard Error: ${name} must not contain query parameters.`);
  }
  if (parsed.hash) {
    throw new Error(`Guard Error: ${name} must not contain hash fragments.`);
  }

  return parsed.origin;
}

/**
 * Validates required disposable test environment configuration.
 * Throws immediately if explicit opt-in is missing, credentials have fallbacks,
 * or endpoints fail exact loopback allowlist checks.
 */
export function assertDisposableTarget() {
  // 1. Explicit Opt-In: DISPOSABLE_AUTH_CI must be explicitly set to 'true'
  if (process.env.DISPOSABLE_AUTH_CI !== 'true') {
    throw new Error(
      'CRITICAL SAFETY GUARD: DISPOSABLE_AUTH_CI must be explicitly set to "true" in environment. No mutations permitted.'
    );
  }

  // 2. Explicit Ephemeral Credentials: No hardcoded fallback credentials allowed
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'R2_ENDPOINT',
    'R2_PRIVATE_BUCKET',
    'R2_PRIVATE_ACCESS_KEY_ID',
    'R2_PRIVATE_SECRET_ACCESS_KEY',
    'APP_URL',
    'DISPOSABLE_RUN_ID',
    'LEAD_IP_HASH_SALT',
  ];

  const missing = requiredVars.filter((v) => !process.env[v] || process.env[v].trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `CRITICAL SAFETY GUARD: Missing required ephemeral configuration without fallback: ${missing.join(', ')}`
    );
  }

  // 3. Parsed exact endpoint allowlists
  // Allowed Supabase ports: 44321 (Kong), 44322 (Postgres), 44320-44329 (local dev), 54321
  validateLoopbackEndpoint(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    [44320, 44321, 44322, 44323, 44324, 44325, 44326, 44327, 44328, 44329, 54321],
    'NEXT_PUBLIC_SUPABASE_URL'
  );

  // Allowed Storage ports: 9000 (MinIO S3 API), 9001 (MinIO Console)
  validateLoopbackEndpoint(
    process.env.R2_ENDPOINT,
    [9000, 9001],
    'R2_ENDPOINT'
  );

  // Allowed Next.js App ports: 3399 (synthetic test daemon), 3000 (standard dev)
  validateLoopbackEndpoint(
    process.env.APP_URL,
    [3000, 3399],
    'APP_URL'
  );

  // 4. Authorized Disposable Bucket Allowlist
  const ALLOWED_BUCKETS = new Set(['synthetic-private', 'test-private', 'disposable-private']);
  if (!ALLOWED_BUCKETS.has(process.env.R2_PRIVATE_BUCKET)) {
    throw new Error(
      `CRITICAL SAFETY GUARD: R2_PRIVATE_BUCKET '${process.env.R2_PRIVATE_BUCKET}' is not an authorized disposable bucket.`
    );
  }

  // 5. Disposable Run Identity format check
  if (!process.env.DISPOSABLE_RUN_ID.startsWith('test-run-')) {
    throw new Error(
      `CRITICAL SAFETY GUARD: DISPOSABLE_RUN_ID must start with 'test-run-', got: '${process.env.DISPOSABLE_RUN_ID}'`
    );
  }
}

export const ENV = {
  get SUPABASE_URL() { assertDisposableTarget(); return process.env.NEXT_PUBLIC_SUPABASE_URL; },
  get PUBLISHABLE_KEY() { assertDisposableTarget(); return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; },
  get SECRET_KEY() { assertDisposableTarget(); return process.env.SUPABASE_SECRET_KEY; },
  get R2_ENDPOINT() { assertDisposableTarget(); return process.env.R2_ENDPOINT; },
  get PRIVATE_BUCKET() { assertDisposableTarget(); return process.env.R2_PRIVATE_BUCKET; },
  get PUBLIC_BUCKET() { assertDisposableTarget(); return process.env.R2_PUBLIC_BUCKET || 'synthetic-public'; },
  get ACCESS_KEY_ID() { assertDisposableTarget(); return process.env.R2_PRIVATE_ACCESS_KEY_ID; },
  get SECRET_ACCESS_KEY() { assertDisposableTarget(); return process.env.R2_PRIVATE_SECRET_ACCESS_KEY; },
  get APP_URL() { assertDisposableTarget(); return process.env.APP_URL; },
  get RUN_ID() { assertDisposableTarget(); return process.env.DISPOSABLE_RUN_ID; },
};

/**
 * Deterministic JSON canonicalizer for descriptor integrity hashing.
 */
export function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalizeJson(obj[k])).join(',') + '}';
}

/**
 * Computes sha256 checksum of canonical descriptor payload (excluding integrityHash itself).
 */
export function computeDescriptorIntegrityHash(descriptor) {
  const { integrityHash, ...payload } = descriptor;
  return createHash('sha256').update(canonicalizeJson(payload)).digest('hex');
}

/**
 * Validates a FreshResourceDescriptor against structural, isolation, and integrity requirements.
 */
export function validateFreshResourceDescriptor(descriptor, expectedRunId = null) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new Error('DESCRIPTOR GUARD: Resource descriptor is missing or not an object.');
  }

  if (descriptor.schemaVersion !== '1.0') {
    throw new Error(`DESCRIPTOR GUARD: Unsupported schemaVersion '${descriptor.schemaVersion}', expected '1.0'`);
  }

  const runId = expectedRunId || (typeof process !== 'undefined' ? process.env.DISPOSABLE_RUN_ID : null);
  if (!runId || !descriptor.runId || descriptor.runId !== runId) {
    throw new Error(`DESCRIPTOR GUARD: Run ID mismatch. Expected '${runId}', received '${descriptor.runId}'`);
  }

  if (!descriptor.runId.startsWith('test-run-')) {
    throw new Error(`DESCRIPTOR GUARD: runId must start with 'test-run-', got: '${descriptor.runId}'`);
  }

  // Containers check
  if (!descriptor.containers || typeof descriptor.containers !== 'object') {
    throw new Error('DESCRIPTOR GUARD: Missing containers section in descriptor.');
  }
  for (const cName of ['postgres', 'storage']) {
    const c = descriptor.containers[cName];
    if (!c || !c.containerId || !c.imageDigest) {
      throw new Error(`DESCRIPTOR GUARD: Container '${cName}' is missing containerId or imageDigest.`);
    }
    if (!c.imageDigest.startsWith('sha256:')) {
      throw new Error(`DESCRIPTOR GUARD: Container '${cName}' imageDigest must start with 'sha256:'.`);
    }
  }

  // Volumes check (ephemeral, not host binds)
  if (!descriptor.volumes || typeof descriptor.volumes !== 'object') {
    throw new Error('DESCRIPTOR GUARD: Missing volumes section in descriptor.');
  }
  for (const vName of ['postgresVolume', 'storageVolume']) {
    const v = descriptor.volumes[vName];
    if (!v || !v.volumeName || v.ephemeral !== true) {
      throw new Error(`DESCRIPTOR GUARD: Volume '${vName}' must be an ephemeral named volume.`);
    }
  }

  // Network isolation check (default-deny egress)
  if (!descriptor.network || !descriptor.network.bridgeNetworkId || descriptor.network.internal !== true) {
    throw new Error('DESCRIPTOR GUARD: Network must specify bridgeNetworkId with internal=true (default-deny egress).');
  }

  // Storage check
  if (!descriptor.storage || !descriptor.storage.bucketName || !descriptor.storage.bucketUuid) {
    throw new Error('DESCRIPTOR GUARD: Storage section must specify bucketName and bucketUuid.');
  }
  if (descriptor.storage.bucketName !== (process.env.R2_PRIVATE_BUCKET || 'synthetic-private')) {
    throw new Error(`DESCRIPTOR GUARD: Bucket name mismatch. Expected '${process.env.R2_PRIVATE_BUCKET}', got '${descriptor.storage.bucketName}'`);
  }

  // Endpoints check
  if (!descriptor.endpoints) {
    throw new Error('DESCRIPTOR GUARD: Missing endpoints section in descriptor.');
  }

  // Integrity hash check
  if (!descriptor.integrityHash) {
    throw new Error('DESCRIPTOR GUARD: Missing descriptor integrityHash.');
  }
  const expectedHash = computeDescriptorIntegrityHash(descriptor);
  if (descriptor.integrityHash !== expectedHash) {
    throw new Error('DESCRIPTOR GUARD: Descriptor integrity hash mismatch (tampered or corrupted descriptor).');
  }

  return true;
}

// Active verified descriptor state in current execution context
let _activeVerifiedDescriptor = null;

export function getVerifiedEnvironmentDescriptor() {
  return _activeVerifiedDescriptor;
}

export function isEnvironmentVerified() {
  return _activeVerifiedDescriptor !== null;
}

export function setVerifiedEnvironmentDescriptor(descriptor) {
  assertDisposableTarget();
  validateFreshResourceDescriptor(descriptor, process.env.DISPOSABLE_RUN_ID);
  _activeVerifiedDescriptor = descriptor;
  return _activeVerifiedDescriptor;
}

export function resetVerifiedEnvironmentDescriptor() {
  _activeVerifiedDescriptor = null;
}

export function assertEnvironmentVerified() {
  assertDisposableTarget();
  if (!_activeVerifiedDescriptor) {
    throw new Error(
      'CRITICAL TRUST BOUNDARY VIOLATION: Environment identity has not been verified. ' +
      'A fresh resource descriptor must be independently verified via verifyDisposableEnvironment() ' +
      'before mutation-ready clients or test executions are permitted.'
    );
  }
  if (_activeVerifiedDescriptor.runId !== process.env.DISPOSABLE_RUN_ID) {
    throw new Error(
      `CRITICAL TRUST BOUNDARY VIOLATION: Active verified descriptor runId '${_activeVerifiedDescriptor.runId}' does not match environment runId '${process.env.DISPOSABLE_RUN_ID}'.`
    );
  }
}

export function loadDescriptorFromPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('DESCRIPTOR GUARD: Descriptor path is missing or invalid.');
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let descriptor;
  try {
    descriptor = JSON.parse(raw);
  } catch (err) {
    throw new Error(`DESCRIPTOR GUARD: Failed to parse descriptor JSON from '${filePath}': ${err.message}`);
  }
  return descriptor;
}

export async function safeFetch(url, options = {}) {
  assertDisposableTarget();
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    assertEnvironmentVerified();
  }

  const targetUrl = new URL(url, ENV.APP_URL);
  validateLoopbackEndpoint(targetUrl.origin, [3000, 3399, 44321, 9000], 'safeFetch target');

  const redirectMode = options.redirect || 'follow';
  if (redirectMode === 'follow') {
    const res = await fetch(targetUrl.href, { ...options, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) {
        const redirectUrl = new URL(location, targetUrl.href);
        validateLoopbackEndpoint(redirectUrl.origin, [3000, 3399, 44321, 9000], 'safeFetch redirect');
        return safeFetch(redirectUrl.href, { ...options, redirect: 'follow' });
      }
    }
    return res;
  }

  return fetch(targetUrl.href, options);
}

export async function streamToString(body) {
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (body && typeof body.transformToString === 'function') return body.transformToString();
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of body) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  return String(body || '');
}

/**
 * Probe-only client creators for pre-flight read-only environment verification.
 * Does not require assertEnvironmentVerified() since they are used to establish verification.
 */
export function createProbeAdminClient() {
  assertDisposableTarget();
  return createClient(ENV.SUPABASE_URL, ENV.SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createProbeStorageClient() {
  assertDisposableTarget();
  return new S3Client({
    endpoint: ENV.R2_ENDPOINT,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: ENV.ACCESS_KEY_ID, secretAccessKey: ENV.SECRET_ACCESS_KEY },
  });
}

/**
 * Verifies that the targeted environment matches an independently provisioned fresh resource descriptor.
 * STRICTLY READ-ONLY: Never executes PutObjectCommand, insert, update, delete, or upsert.
 * Reads and validates storage marker and database connectivity against the expected descriptor identity.
 * NEVER queries or mutates rate_limits or operational application tables.
 * Fails closed if any marker or descriptor field is missing, mismatched, malformed, or unreadable.
 */
export async function verifyDisposableEnvironment(descriptor, probeAdmin = null, probeStorage = null) {
  assertDisposableTarget();
  validateFreshResourceDescriptor(descriptor, process.env.DISPOSABLE_RUN_ID);

  const storage = probeStorage || createProbeStorageClient();
  const admin = probeAdmin || createProbeAdminClient();
  const runId = descriptor.runId;

  // 1. Read-only Storage Marker Verification
  const markerKey = `disposable-markers/${runId}.json`;
  let storageObj;
  try {
    storageObj = await storage.send(new GetObjectCommand({
      Bucket: ENV.PRIVATE_BUCKET,
      Key: markerKey,
    }));
  } catch (err) {
    throw new Error(`CRITICAL SAFETY HALT: Disposable storage marker '${markerKey}' is missing or unreadable: ${err.message}`);
  }

  if (!storageObj || !storageObj.Body) {
    throw new Error(`CRITICAL SAFETY HALT: Disposable storage marker '${markerKey}' has empty or invalid body.`);
  }

  let storageMarker;
  try {
    const raw = await streamToString(storageObj.Body);
    storageMarker = JSON.parse(raw);
  } catch (err) {
    throw new Error(`CRITICAL SAFETY HALT: Disposable storage marker '${markerKey}' is malformed JSON: ${err.message}`);
  }

  if (
    !storageMarker ||
    typeof storageMarker !== 'object' ||
    storageMarker.runId !== runId ||
    storageMarker.target !== 'disposable-acceptance' ||
    storageMarker.bucketUuid !== descriptor.storage.bucketUuid ||
    storageMarker.postgresContainerId !== descriptor.containers.postgres.containerId ||
    storageMarker.storageContainerId !== descriptor.containers.storage.containerId
  ) {
    throw new Error(
      `CRITICAL SAFETY HALT: Storage marker identity mismatch. Expected runId '${runId}' with matching containers/bucket, received: ${JSON.stringify(storageMarker)}`
    );
  }

  // 2. Read-only Database Probe Check (Verifies database connectivity without application table mutation or rate_limits pollution)
  const { data: dbData, error: dbErr } = await admin.from('files').select('id').limit(0);
  if (dbErr) {
    throw new Error(`CRITICAL SAFETY HALT: Database read-only probe failed: ${dbErr.message}`);
  }

  // 3. Mark environment as verified
  setVerifiedEnvironmentDescriptor(descriptor);

  return {
    verified: true,
    runId,
    descriptor,
    storageMarker,
  };
}

/**
 * Permanently disabled/removed. Acceptance suites must never self-provision or mark the test environment.
 */
export function provisionDisposableEnvironment() {
  throw new Error(
    'CRITICAL SAFETY HALT: provisionDisposableEnvironment() is permanently removed. ' +
    'Acceptance tests cannot self-provision or mark test environments. ' +
    'Environments must be independently provisioned before test launch.'
  );
}

/**
 * Creates mutation-ready Supabase admin client.
 * Strictly gated behind active verified environment descriptor.
 */
export function createAdminClient() {
  assertDisposableTarget();
  assertEnvironmentVerified();
  return createClient(ENV.SUPABASE_URL, ENV.SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Creates mutation-ready S3 storage client.
 * Strictly gated behind active verified environment descriptor.
 */
export function createStorageClient() {
  assertDisposableTarget();
  assertEnvironmentVerified();
  return new S3Client({
    endpoint: ENV.R2_ENDPOINT,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: ENV.ACCESS_KEY_ID, secretAccessKey: ENV.SECRET_ACCESS_KEY },
  });
}

export async function getSessionCookie(email, password) {
  assertDisposableTarget();
  let setCookies = [];
  const supabase = createServerClient(ENV.SUPABASE_URL, ENV.PUBLISHABLE_KEY, {
    cookies: {
      getAll() { return []; },
      setAll(cookies) { setCookies = cookies; },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Sign-in failed: ' + error.message);
  return setCookies.map(c => `${c.name}=${c.value}`).join('; ');
}

export function sha256(b) {
  return createHash('sha256').update(b).digest('hex');
}

/**
 * Preserves primary test failure alongside subsequent cleanup failures without masking either.
 */
export async function runWithCleanup(tracker, testFn) {
  let primaryError = null;
  try {
    return await testFn();
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    try {
      await tracker.cleanup();
    } catch (cleanupErr) {
      if (primaryError) {
        const combined = new Error(
          `PRIMARY TEST ERROR: ${primaryError.message}\n` +
          `SUBSEQUENT CLEANUP ERROR: ${cleanupErr.message}`
        );
        combined.primaryError = primaryError;
        combined.cleanupError = cleanupErr;
        throw combined;
      }
      throw cleanupErr;
    }
  }
}

/**
 * FixtureTracker: Tracks every created resource as soon as discoverable.
 * Maintains an immutable complete inventory of all created resources separate from pending-cleanup sets.
 * Respects protected schema grants (service_role DELETE revoked by design on immutable_uploads, file_recovery, recovery_imports).
 * Reports per-object S3 errors, incomplete deletion responses, exact-resource read verification,
 * and produces an explicit sanitized manifest distinguishing deleted, verified absent, intentionally retained, and failed resources.
 */
export class FixtureTracker {
  constructor(admin, storage, runId = null) {
    this.admin = admin;
    this.storage = storage;
    this.runId = runId || (typeof process !== 'undefined' && process.env.DISPOSABLE_RUN_ID ? process.env.DISPOSABLE_RUN_ID : 'unknown-run');
    
    // Immutable inventory of all resources ever registered in this run
    this.inventory = {
      keys: new Set(),
      files: new Set(),
      tickets: new Set(),
      projects: new Set(),
      imports: new Set(),
      users: new Set(),
      recoveries: new Map(), // fileId -> recoveryKey
    };

    // Pending cleanup sets
    this.pendingKeys = new Set();
    this.pendingFiles = new Set();
    this.pendingTickets = new Set();
    this.pendingProjects = new Set();
    this.pendingUsers = new Set();

    this.cleanupErrors = [];
    this.manifest = {
      runId: this.runId,
      deleted: [],
      verifiedAbsent: [],
      intentionallyRetained: [],
      failed: [],
      cleanupErrors: [],
    };
  }

  trackKey(key) {
    if (key) {
      this.inventory.keys.add(key);
      this.pendingKeys.add(key);
    }
    return key;
  }

  trackFile(id) {
    if (id) {
      this.inventory.files.add(id);
      this.pendingFiles.add(id);
    }
    return id;
  }

  trackFileResult(res) {
    if (!res) return null;
    if (typeof res === 'string') return this.trackFile(res);
    if (res.file_id) return this.trackFile(res.file_id);
    if (res.id) return this.trackFile(res.id);
    return null;
  }

  trackProject(id) {
    if (id) {
      this.inventory.projects.add(id);
      this.pendingProjects.add(id);
    }
    return id;
  }

  trackTicket(id) {
    if (id) {
      this.inventory.tickets.add(id);
      this.pendingTickets.add(id);
    }
    return id;
  }

  trackImport(id) {
    if (id) {
      this.inventory.imports.add(id);
    }
    return id;
  }

  trackUser(id) {
    if (id) {
      this.inventory.users.add(id);
      this.pendingUsers.add(id);
    }
    return id;
  }

  trackRecovery(fileId, recoveryKey) {
    if (fileId && recoveryKey) {
      this.inventory.recoveries.set(fileId, recoveryKey);
    }
    return recoveryKey;
  }

  declareRetention(resourceType, idOrKey, rationale) {
    this.manifest.intentionallyRetained.push({ resourceType, identifier: idOrKey, rationale });
  }

  getManifest() {
    return {
      runId: this.runId,
      inventory: {
        keys: Array.from(this.inventory.keys),
        files: Array.from(this.inventory.files),
        tickets: Array.from(this.inventory.tickets),
        projects: Array.from(this.inventory.projects),
        imports: Array.from(this.inventory.imports),
        users: Array.from(this.inventory.users),
        recoveries: Object.fromEntries(this.inventory.recoveries),
      },
      deleted: [...this.manifest.deleted],
      verifiedAbsent: [...this.manifest.verifiedAbsent],
      intentionallyRetained: [...this.manifest.intentionallyRetained],
      failed: [...this.manifest.failed],
      cleanupErrors: [...this.cleanupErrors],
    };
  }

  exportSanitizedManifest() {
    return JSON.stringify(this.getManifest(), null, 2);
  }

  async cleanup() {
    assertEnvironmentVerified();
    this.cleanupErrors = [];

    // 1. Clean S3 Storage objects
    if (this.pendingKeys.size > 0) {
      const keysToDelete = Array.from(this.pendingKeys);
      try {
        const deleteRes = await this.storage.send(new DeleteObjectsCommand({
          Bucket: ENV.PRIVATE_BUCKET,
          Delete: { Objects: keysToDelete.map(k => ({ Key: k })), Quiet: false },
        }));

        const deletedSet = new Set((deleteRes.Deleted || []).map(d => d.Key));
        for (const k of deletedSet) {
          this.manifest.deleted.push({ resourceType: 'storage_key', identifier: k });
          this.pendingKeys.delete(k);
        }

        if (deleteRes.Errors && deleteRes.Errors.length > 0) {
          for (const err of deleteRes.Errors) {
            const msg = `S3 delete failed for key '${err.Key}': ${err.Message} (${err.Code})`;
            this.cleanupErrors.push(msg);
            this.manifest.failed.push({ resourceType: 'storage_key', identifier: err.Key, error: msg });
          }
        }

        // Check for incomplete response (omitted keys)
        for (const k of keysToDelete) {
          const inDeleted = deletedSet.has(k);
          const inErrors = (deleteRes.Errors || []).some(e => e.Key === k);
          if (!inDeleted && !inErrors) {
            const msg = `S3 delete incomplete response for key '${k}': key omitted from both Deleted and Errors arrays`;
            this.cleanupErrors.push(msg);
            this.manifest.failed.push({ resourceType: 'storage_key', identifier: k, error: msg });
          }
        }
      } catch (err) {
        const msg = `S3 DeleteObjectsCommand exception: ${err.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'storage_batch', error: msg });
      }
    }

    // 2. Clean email_outbox rows for all created files
    const fileIds = Array.from(this.inventory.files);
    if (fileIds.length > 0) {
      const { error: outboxErr } = await this.admin.from('email_outbox').delete().in('entity_id', fileIds);
      if (outboxErr) {
        const msg = `email_outbox delete error for entity IDs [${fileIds.join(', ')}]: ${outboxErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'email_outbox', error: msg });
      } else {
        this.manifest.deleted.push({ resourceType: 'email_outbox', entityIds: fileIds });
      }
    }

    // 3. Inspect and account for protected registries (NEVER attempt unauthorized DELETE)
    // 3a. immutable_uploads (DELETE revoked from service_role by migration 0039)
    const allKeys = Array.from(this.inventory.keys);
    if (allKeys.length > 0) {
      const { data: immRows, error: immErr } = await this.admin
        .from('immutable_uploads')
        .select('r2_key, source_key, sha256, size_bytes')
        .in('r2_key', allKeys);

      if (immErr) {
        const msg = `immutable_uploads query error: ${immErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'immutable_uploads', error: msg });
      } else if (immRows && immRows.length > 0) {
        for (const row of immRows) {
          this.manifest.intentionallyRetained.push({
            resourceType: 'immutable_uploads',
            identifier: row.r2_key,
            sha256: row.sha256,
            sizeBytes: row.size_bytes,
            rationale: 'Protected upload proof registry (DELETE revoked from service_role by migration 0039)',
          });
        }
      }
    }

    // 3b. recovery_imports (DELETE revoked from service_role by migration 0038)
    const allImports = Array.from(this.inventory.imports);
    if (allImports.length > 0) {
      const { data: impRows, error: impErr } = await this.admin
        .from('recovery_imports')
        .select('id, actor, upload_key, sealed_key, sha256')
        .in('id', allImports);

      if (impErr) {
        const msg = `recovery_imports query error: ${impErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'recovery_imports', error: msg });
      } else if (impRows && impRows.length > 0) {
        for (const row of impRows) {
          this.manifest.intentionallyRetained.push({
            resourceType: 'recovery_imports',
            identifier: row.id,
            rationale: 'Protected recovery import audit registry (DELETE revoked from service_role by migration 0038)',
          });
        }
      }
    }

    // 3c. file_recovery (DELETE revoked from service_role by migration 0037)
    if (fileIds.length > 0) {
      const { data: recRows, error: recErr } = await this.admin
        .from('file_recovery')
        .select('file_id, recovery_key, sha256, archive_bytes')
        .in('file_id', fileIds);

      if (recErr) {
        const msg = `file_recovery query error: ${recErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'file_recovery', error: msg });
      } else if (recRows && recRows.length > 0) {
        for (const row of recRows) {
          const isObjectDeleted = this.manifest.deleted.some(
            d => d.resourceType === 'storage_key' && d.identifier === row.recovery_key
          );

          if (isObjectDeleted) {
            this.manifest.intentionallyRetained.push({
              resourceType: 'file_recovery',
              identifier: row.file_id,
              recoveryKey: row.recovery_key,
              objectDisposition: 'deleted',
              status: 'unusable tombstone',
              rationale: 'Protected file recovery registry row intentionally retained (DELETE revoked from service_role by migration 0037); associated archive object deleted',
            });
          } else {
            // Archive object retained: strictly verify existence, byte length, hash, and format
            let archiveStatus = 'retained-unverified';
            let validationError = null;

            try {
              const head = await this.storage.send(new HeadObjectCommand({
                Bucket: ENV.PRIVATE_BUCKET,
                Key: row.recovery_key,
              }));

              const actualBytes = head.ContentLength;
              if (actualBytes === undefined || actualBytes === null) {
                archiveStatus = 'verification-failed';
                validationError = `Archive object '${row.recovery_key}' ContentLength is missing`;
              } else if (row.archive_bytes !== null && row.archive_bytes !== undefined && actualBytes !== row.archive_bytes) {
                archiveStatus = 'verification-failed';
                validationError = `Archive object '${row.recovery_key}' byte length mismatch: expected ${row.archive_bytes}, actual ${actualBytes}`;
              } else {
                try {
                  const getRes = await this.storage.send(new GetObjectCommand({
                    Bucket: ENV.PRIVATE_BUCKET,
                    Key: row.recovery_key,
                  }));

                  let bodyBuffer;
                  if (Buffer.isBuffer(getRes.Body)) {
                    bodyBuffer = getRes.Body;
                  } else if (typeof getRes.Body?.transformToByteArray === 'function') {
                    bodyBuffer = Buffer.from(await getRes.Body.transformToByteArray());
                  } else {
                    const str = await streamToString(getRes.Body);
                    bodyBuffer = Buffer.from(str, 'binary');
                  }

                  // Format validation: check standard ZIP header (PK\x03\x04 / 0x50 0x4b 0x03 0x04)
                  const isZip = bodyBuffer.length >= 4 &&
                    bodyBuffer[0] === 0x50 && bodyBuffer[1] === 0x4b &&
                    bodyBuffer[2] === 0x03 && bodyBuffer[3] === 0x04;

                  const computedHash = createHash('sha256').update(bodyBuffer).digest('hex');
                  const hashMatches = !row.sha256 || computedHash === row.sha256;

                  if (isZip && hashMatches) {
                    archiveStatus = 'usable backup';
                  } else if (!isZip) {
                    archiveStatus = 'verification-failed';
                    validationError = `Archive object '${row.recovery_key}' format validation failed: missing ZIP header magic bytes (PK\\x03\\x04)`;
                  } else {
                    archiveStatus = 'verification-failed';
                    validationError = `Archive object '${row.recovery_key}' sha256 hash mismatch: expected ${row.sha256}, computed ${computedHash}`;
                  }
                } catch (readErr) {
                  archiveStatus = 'retained-unverified';
                  validationError = `Archive object '${row.recovery_key}' body read failed: ${readErr.message}`;
                }
              }
            } catch (headErr) {
              archiveStatus = 'verification-failed';
              validationError = `Archive object '${row.recovery_key}' HeadObject failed: ${headErr.message}`;
            }

            if (archiveStatus === 'verification-failed') {
              const msg = `Archive verification failure for '${row.recovery_key}': ${validationError}`;
              this.cleanupErrors.push(msg);
              this.manifest.failed.push({ resourceType: 'file_recovery_archive', identifier: row.recovery_key, error: msg });
            }

            this.manifest.intentionallyRetained.push({
              resourceType: 'file_recovery',
              identifier: row.file_id,
              recoveryKey: row.recovery_key,
              objectDisposition: 'retained',
              status: archiveStatus,
              validationError: validationError || undefined,
              rationale: `Protected file recovery registry row intentionally retained (DELETE revoked from service_role by migration 0037); archive status: ${archiveStatus}`,
            });
          }
        }
      }
    }

    // 4. Clean authorized database tables
    // 4a. Clean files
    if (fileIds.length > 0) {
      const { error: fErr } = await this.admin.from('files').delete().in('id', fileIds);
      if (fErr) {
        const msg = `files delete error for files [${fileIds.join(', ')}]: ${fErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'files', error: msg });
      } else {
        this.manifest.deleted.push({ resourceType: 'files', count: fileIds.length });
        for (const fid of fileIds) this.pendingFiles.delete(fid);
      }
    }

    // 4b. Clean projects, project_recovery, storage_deletions, milestones
    const projectIds = Array.from(this.inventory.projects);
    if (projectIds.length > 0) {
      const { error: sdErr } = await this.admin.from('storage_deletions').delete().in('project_id', projectIds);
      if (sdErr) {
        const msg = `storage_deletions delete error for projects [${projectIds.join(', ')}]: ${sdErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'storage_deletions', error: msg });
      }

      const { error: prErr } = await this.admin.from('project_recovery').delete().in('project_id', projectIds);
      if (prErr) {
        const msg = `project_recovery delete error for projects [${projectIds.join(', ')}]: ${prErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'project_recovery', error: msg });
      }

      const { error: mErr } = await this.admin.from('milestones').delete().in('project_id', projectIds);
      if (mErr) {
        const msg = `milestones delete error for projects [${projectIds.join(', ')}]: ${mErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'milestones', error: msg });
      }

      const { error: pErr } = await this.admin.from('projects').delete().in('id', projectIds);
      if (pErr) {
        const msg = `projects delete error for projects [${projectIds.join(', ')}]: ${pErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'projects', error: msg });
      } else {
        this.manifest.deleted.push({ resourceType: 'projects', count: projectIds.length });
        for (const pid of projectIds) this.pendingProjects.delete(pid);
      }
    }

    // 4c. Clean tickets
    const ticketIds = Array.from(this.inventory.tickets);
    if (ticketIds.length > 0) {
      const { error: tErr } = await this.admin.from('tickets').delete().in('id', ticketIds);
      if (tErr) {
        const msg = `tickets delete error for tickets [${ticketIds.join(', ')}]: ${tErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'tickets', error: msg });
      } else {
        this.manifest.deleted.push({ resourceType: 'tickets', count: ticketIds.length });
        for (const tid of ticketIds) this.pendingTickets.delete(tid);
      }
    }

    // 4d. Clean Auth users
    const userIds = Array.from(this.inventory.users);
    if (userIds.length > 0) {
      for (const uid of userIds) {
        const { error: uErr } = await this.admin.auth.admin.deleteUser(uid);
        if (uErr) {
          const msg = `auth.users delete error for user '${uid}': ${uErr.message}`;
          this.cleanupErrors.push(msg);
          this.manifest.failed.push({ resourceType: 'auth_user', identifier: uid, error: msg });
        } else {
          this.manifest.deleted.push({ resourceType: 'auth_user', identifier: uid });
          this.pendingUsers.delete(uid);
        }
      }
    }

    // 5. Post-cleanup exact-resource verification (Reads)
    // 5a. Verify S3 keys absent
    for (const d of this.manifest.deleted) {
      if (d.resourceType === 'storage_key') {
        try {
          await this.storage.send(new HeadObjectCommand({
            Bucket: ENV.PRIVATE_BUCKET,
            Key: d.identifier,
          }));
          const msg = `Post-cleanup verification failed: Storage key '${d.identifier}' still exists after deletion`;
          this.cleanupErrors.push(msg);
          this.manifest.failed.push({ resourceType: 'storage_key', identifier: d.identifier, error: msg });
        } catch (err) {
          if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404 || err.name === 'NoSuchKey') {
            this.manifest.verifiedAbsent.push({ resourceType: 'storage_key', identifier: d.identifier });
          } else {
            const msg = `Post-cleanup verification error for storage key '${d.identifier}': ${err.message}`;
            this.cleanupErrors.push(msg);
            this.manifest.failed.push({ resourceType: 'storage_key', identifier: d.identifier, error: msg });
          }
        }
      }
    }

    // 5b. Verify files absent
    if (fileIds.length > 0) {
      const { data: remFiles, error: cfErr } = await this.admin.from('files').select('id').in('id', fileIds);
      if (cfErr) {
        this.cleanupErrors.push(`Post-cleanup file read error: ${cfErr.message}`);
      } else if (remFiles && remFiles.length > 0) {
        const remIds = remFiles.map(r => r.id);
        const msg = `Post-cleanup verification failed: File(s) [${remIds.join(', ')}] still exist after deletion`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'files', remaining: remIds, error: msg });
      } else {
        this.manifest.verifiedAbsent.push({ resourceType: 'files', count: fileIds.length });
      }
    }

    // 5c. Verify projects absent
    if (projectIds.length > 0) {
      const { data: remProjs, error: cpErr } = await this.admin.from('projects').select('id').in('id', projectIds);
      if (cpErr) {
        this.cleanupErrors.push(`Post-cleanup project read error: ${cpErr.message}`);
      } else if (remProjs && remProjs.length > 0) {
        const remIds = remProjs.map(r => r.id);
        const msg = `Post-cleanup verification failed: Project(s) [${remIds.join(', ')}] still exist after deletion`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'projects', remaining: remIds, error: msg });
      } else {
        this.manifest.verifiedAbsent.push({ resourceType: 'projects', count: projectIds.length });
      }
    }

    // 5d. Verify auth users absent (Strictly requiring explicit 404 / User not found; timeouts/500s are failures)
    for (const uid of userIds) {
      try {
        const { data: uData, error: uErr } = await this.admin.auth.admin.getUserById(uid);
        if (uErr) {
          const errCode = uErr.code || (uErr.error && uErr.error.code) || '';
          const errMsg = (uErr.message || '').toLowerCase();
          const errStatus = uErr.status || uErr.statusCode || 0;

          const isExplicitNotFound =
            errStatus === 404 ||
            errCode === 'user_not_found' ||
            errCode === 'not_found' ||
            (errMsg.includes('user not found') && !errMsg.includes('timeout') && !errMsg.includes('connection'));

          const isTransientOrServerError =
            errStatus >= 500 ||
            errMsg.includes('timeout') ||
            errMsg.includes('econnrefused') ||
            errMsg.includes('fetcherror') ||
            errMsg.includes('internal') ||
            errMsg.includes('abort');

          if (isExplicitNotFound && !isTransientOrServerError) {
            this.manifest.verifiedAbsent.push({ resourceType: 'auth_user', identifier: uid });
          } else {
            const msg = `Post-cleanup auth user verification failed for '${uid}': Auth API error [status=${errStatus}, code=${errCode}]: ${uErr.message}`;
            this.cleanupErrors.push(msg);
            this.manifest.failed.push({ resourceType: 'auth_user', identifier: uid, error: msg });
          }
        } else if (uData && uData.user) {
          const msg = `Post-cleanup verification failed: Auth user '${uid}' still exists after deletion`;
          this.cleanupErrors.push(msg);
          this.manifest.failed.push({ resourceType: 'auth_user', identifier: uid, error: msg });
        } else {
          const msg = `Post-cleanup auth user verification returned empty response without error for '${uid}'`;
          this.cleanupErrors.push(msg);
          this.manifest.failed.push({ resourceType: 'auth_user', identifier: uid, error: msg });
        }
      } catch (networkErr) {
        const msg = `Post-cleanup auth user verification threw exception for '${uid}': ${networkErr.message}`;
        this.cleanupErrors.push(msg);
        this.manifest.failed.push({ resourceType: 'auth_user', identifier: uid, error: msg });
      }
    }

    // 6. Aggregate error reporting
    if (this.cleanupErrors.length > 0) {
      const summary = `Fixture cleanup encountered ${this.cleanupErrors.length} failure(s):\n` + this.cleanupErrors.join('\n');
      console.error(summary);
      throw new Error(summary);
    }
  }
}
