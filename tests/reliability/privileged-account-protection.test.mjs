import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// Global synthetic state for privileged account protection tests
const f = {
  users: new Map(),
  profiles: new Map(),
  leads: new Map(),
  queuedEmails: [],
  calls: {
    updateUserById: [],
    profileUpdates: [],
    leadUpdates: [],
  },
  authUpdateError: null,
  profileUpdateError: null,
  session: null,
  serverClientClaims: null,
  serverClientProfile: null,
};
globalThis.__privProtection = f;

function resetState() {
  f.users.clear();
  f.profiles.clear();
  f.leads.clear();
  f.queuedEmails.length = 0;
  f.calls.updateUserById.length = 0;
  f.calls.profileUpdates.length = 0;
  f.calls.leadUpdates.length = 0;
  f.authUpdateError = null;
  f.profileUpdateError = null;
  f.session = { userId: 'admin-1', role: 'admin' };
  f.serverClientClaims = {
    data: { claims: { sub: 'admin-1', email: 'admin@example.test', app_metadata: { role: 'admin' } } },
    error: null,
  };
  f.serverClientProfile = { role: 'admin', is_active: true };
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.updateData = null;
  }
  select(_fields = '*', _opts) {
    return this;
  }
  order(_field, _opts) {
    return this;
  }
  range(_from, _to) {
    return this;
  }
  eq(field, val) {
    this.filters.push({ field, op: 'eq', val });
    return this;
  }
  is(field, val) {
    this.filters.push({ field, op: 'is', val });
    return this;
  }
  update(data) {
    this.updateData = data;
    return this;
  }
  _matches(record) {
    for (const flt of this.filters) {
      if (flt.op === 'eq' && record[flt.field] !== flt.val) return false;
      if (flt.op === 'is' && record[flt.field] !== flt.val) return false;
    }
    return true;
  }
  async maybeSingle() {
    if (this.table === 'profiles') {
      if (this.updateData) {
        if (f.profileUpdateError) return { data: null, error: f.profileUpdateError };
        for (const [id, prof] of f.profiles.entries()) {
          if (this._matches(prof)) {
            const updated = { ...prof, ...this.updateData };
            f.profiles.set(id, updated);
            f.calls.profileUpdates.push({ id, update: this.updateData });
            return { data: { id: updated.id }, error: null };
          }
        }
        return { data: null, error: null };
      }
      for (const prof of f.profiles.values()) {
        if (this._matches(prof)) return { data: prof, error: null };
      }
      return { data: null, error: null };
    }
    if (this.table === 'leads') {
      if (this.updateData) {
        for (const [id, lead] of f.leads.entries()) {
          if (this._matches(lead)) {
            const updated = { ...lead, ...this.updateData };
            f.leads.set(id, updated);
            f.calls.leadUpdates.push({ id, update: this.updateData });
            return { data: { id: updated.id }, error: null };
          }
        }
        return { data: null, error: null };
      }
      for (const lead of f.leads.values()) {
        if (this._matches(lead)) return { data: lead, error: null };
      }
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }
  then(resolve, reject) {
    if (this.table === 'profiles') {
      const rows = [];
      for (const prof of f.profiles.values()) {
        if (this._matches(prof)) rows.push(prof);
      }
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    }
    return Promise.resolve({ data: [], error: null }).then(resolve, reject);
  }
  async single() {
    return this.maybeSingle();
  }
}

const stub = (names) => names.map((name) => `export async function ${name}(){return {ok:true};}`).join('\n');

const modules = {
  'server-only': 'export {};',
  'next/cache': 'export function revalidatePath(){}',
  '@/lib/email/recipients': 'export async function emailOrigin(){return "https://example.test";}export async function recipientEmail(){return null;}',
  '@/lib/email': `
    export function queueEmail(fn){ globalThis.__privProtection.queuedEmails.push(fn); }
    export async function recordExternalSend(){ return {ok:true,resendId:null}; }
    export async function recordUnsent(){ return {ok:false,error:"unsent-recorded"}; }
    export async function sendDeliverableUploadedEmail(){ return {ok:true}; }
  `,
  '@/lib/crm/tickets': stub(['adminReply', 'setTicketStatus']),
  '@/lib/crm/projects': stub([
    'addMilestone', 'archiveProject', 'createProject', 'deleteMilestone',
    'getArchiveDownloadUrl', 'moveMilestone', 'purgeArchivedProject',
    'updateMilestone', 'updateProject'
  ]),
  '@/lib/crm/files': 'export async function createFileRow(){return {ok:true};}export async function deleteOwnedFile(){return {ok:true};}',
  '@/lib/r2': 'export const ASSET_ALLOWED_EXT=[],ASSET_MAX_BYTES=5242880;' + stub([
    'assetUrl', 'deletePublicObject', 'makeAssetKey', 'makeDeliverableKey',
    'presignPrivatePut', 'putPublicObject', 'validateContactFile'
  ]),
  '@/lib/mime': stub(['extFromFilename', 'isAllowedAssetMime']),
  '@/lib/format': 'export function formatBytes(){return "synthetic";}',
  '@/lib/crm/invoices': stub([
    'addInvoiceItem', 'confirmPayment', 'createDraftInvoice', 'createDraftInvoiceWithItems',
    'deleteInvoiceItem', 'getInvoiceDetail', 'rejectPayment', 'sendInvoice',
    'updateDraftInvoice', 'updateInvoiceItem', 'voidInvoice'
  ]),
  '@/lib/crm/deliverable-validation': 'export async function validateDeliverable(){return null;}',
  '@/lib/crm/milestone-money': 'export function parseMilestoneMoney(){return {ok:true,amount_cents:100};}',
  '@/lib/supabase/admin': `
    export function getSupabaseAdmin() {
      const f = globalThis.__privProtection;
      return {
        from(table) {
          return new (globalThis.__privProtectionQueryBuilder)(table);
        },
        auth: {
          admin: {
            async getUserById(id) {
              const u = f.users.get(id);
              if (!u) return { data: null, error: { message: 'User not found' } };
              return { data: { user: u }, error: null };
            },
            async listUsers({ page = 1, perPage = 200 } = {}) {
              const all = Array.from(f.users.values());
              const start = (page - 1) * perPage;
              const slice = all.slice(start, start + perPage);
              return { data: { users: slice, total: all.length }, error: null };
            },
            async inviteUserByEmail(email, { redirectTo } = {}) {
              const id = 'invited-' + Math.random().toString(36).slice(2, 9);
              const user = { id, email, app_metadata: { role: 'client' } };
              f.users.set(id, user);
              f.profiles.set(id, { id, role: 'client', is_active: true, full_name: null, company: null });
              return { data: { user }, error: null };
            },
            async updateUserById(id, updates) {
              if (f.authUpdateError) return { data: null, error: f.authUpdateError };
              const user = f.users.get(id);
              if (!user) return { data: null, error: { message: 'User not found' } };
              const updated = { ...user, ...updates };
              if (updates.app_metadata) updated.app_metadata = { ...user.app_metadata, ...updates.app_metadata };
              f.users.set(id, updated);
              f.calls.updateUserById.push({ id, updates });
              return { data: { user: updated }, error: null };
            }
          }
        }
      };
    }
  `,
  '@/lib/supabase/server': `
    export async function createSupabaseServerClient() {
      const f = globalThis.__privProtection;
      return {
        auth: {
          async getClaims() {
            return f.serverClientClaims;
          }
        },
        from(table) {
          return {
            select() { return this; },
            eq() { return this; },
            async maybeSingle() {
              return { data: f.serverClientProfile, error: null };
            }
          };
        }
      };
    }
  `,
  '@/lib/auth/session': `
    export async function getCurrentSession() {
      return globalThis.__privProtection.session;
    }
  `,
};

globalThis.__privProtectionQueryBuilder = QueryBuilder;

const hooks = registerHooks({
  resolve(s, c, n) {
    if (Object.hasOwn(modules, s)) {
      return { url: 'data:text/javascript,' + encodeURIComponent(modules[s]), shortCircuit: true };
    }
    if (s === '@/lib/crm/result') {
      return { url: new URL('../../lib/crm/result.ts', import.meta.url).href, shortCircuit: true };
    }
    if (s === '@/lib/crm/auth-admin') {
      return { url: new URL('../../lib/crm/auth-admin.ts', import.meta.url).href, shortCircuit: true };
    }
    if (s === '@/lib/crm/clients') {
      return { url: new URL('../../lib/crm/clients.ts', import.meta.url).href, shortCircuit: true };
    }
    return n(s, c);
  },
});

const { listClients, inviteClient, setClientActive, convertLead } = await import('../../lib/crm/clients.ts');
const { setClientActiveAction } = await import('../../lib/crm/admin-actions.ts');
const { getCurrentSession: realGetCurrentSession } = await import('../../lib/auth/session.ts');
hooks.deregister();

// --------------------------------------------------------------------------
// SUITE 1: Dual Role Store Protection Matrix for Admin Accounts
// --------------------------------------------------------------------------

test('dual-store admin protection: inviteClient refuses across all admin permutations', async () => {
  const permutations = [
    { label: 'both stores admin', authRole: 'admin', profileRole: 'admin' },
    { label: 'auth admin drift', authRole: 'admin', profileRole: 'client' },
    { label: 'profile admin drift', authRole: 'client', profileRole: 'admin' },
    { label: 'unassigned auth admin', authRole: undefined, profileRole: 'admin' },
  ];

  for (const { label, authRole, profileRole } of permutations) {
    resetState();
    const adminId = 'target-admin-user';
    const email = 'existing-admin@example.test';
    f.users.set(adminId, { id: adminId, email, app_metadata: { role: authRole } });
    f.profiles.set(adminId, { id: adminId, role: profileRole, is_active: true, full_name: 'Existing Admin', company: 'Admin Corp' });

    const result = await inviteClient({
      email,
      fullName: 'Attacker Overwrite',
      company: 'Attacker Co',
      redirectToBase: 'https://example.test',
    });

    assert.equal(result.ok, false, `Failed to reject invite for ${label}`);
    assert.match(
      result.error,
      /admin account|protected account/,
      `Expected protected account message for ${label}, got: ${result.error}`
    );

    // Ensure zero side effects: no profile writes, no auth updates, no emails sent
    assert.equal(f.calls.profileUpdates.length, 0, `Profile was modified for ${label}`);
    assert.equal(f.calls.updateUserById.length, 0, `Auth metadata was modified for ${label}`);
    assert.equal(f.queuedEmails.length, 0, `Email was queued for ${label}`);

    // Verify existing profile data is intact
    const unchanged = f.profiles.get(adminId);
    assert.equal(unchanged.role, profileRole);
    assert.equal(unchanged.full_name, 'Existing Admin');
    assert.equal(unchanged.company, 'Admin Corp');
  }
});

// --------------------------------------------------------------------------
// SUITE 2: Refusal of Admin Deactivation & Admin Invariants
// --------------------------------------------------------------------------

test('admin invariant: setClientActive rejects deactivating or reactivating admin accounts', async () => {
  resetState();
  const adminId = 'perm-admin-1';
  f.users.set(adminId, { id: adminId, email: 'admin@example.test', app_metadata: { role: 'admin' } });
  f.profiles.set(adminId, { id: adminId, role: 'admin', is_active: true });

  // Attempt deactivation of admin
  const deact = await setClientActive(adminId, false);
  assert.equal(deact.ok, false);
  assert.equal(deact.error, 'Client not found.');
  assert.equal(f.calls.profileUpdates.length, 0);
  assert.equal(f.calls.updateUserById.length, 0);
  assert.equal(f.profiles.get(adminId).is_active, true);

  // Attempt reactivation call on admin
  const react = await setClientActive(adminId, true);
  assert.equal(react.ok, false);
  assert.equal(react.error, 'Client not found.');
  assert.equal(f.calls.profileUpdates.length, 0);
  assert.equal(f.calls.updateUserById.length, 0);
});

test('admin invariant: setClientActive rejects non-boolean active values', async () => {
  resetState();
  const clientId = 'client-1';
  f.users.set(clientId, { id: clientId, email: 'client@example.test', app_metadata: { role: 'client' } });
  f.profiles.set(clientId, { id: clientId, role: 'client', is_active: true });

  for (const invalid of ['false', 'true', null, undefined, 0, 1]) {
    const res = await setClientActive(clientId, invalid);
    assert.equal(res.ok, false);
    assert.equal(res.error, 'Invalid account state.');
    assert.equal(f.calls.profileUpdates.length, 0);
    assert.equal(f.calls.updateUserById.length, 0);
  }
});

test('admin action boundary: setClientActiveAction protects admin accounts and denies unauthorized callers', async () => {
  resetState();
  const adminId = 'admin-caller-1';
  const targetAdminId = 'target-admin-2';
  const validClientId = 'client-target-3';

  f.users.set(adminId, { id: adminId, email: 'admin1@example.test', app_metadata: { role: 'admin' } });
  f.profiles.set(adminId, { id: adminId, role: 'admin', is_active: true });

  f.users.set(targetAdminId, { id: targetAdminId, email: 'admin2@example.test', app_metadata: { role: 'admin' } });
  f.profiles.set(targetAdminId, { id: targetAdminId, role: 'admin', is_active: true });

  f.users.set(validClientId, { id: validClientId, email: 'client@example.test', app_metadata: { role: 'client' } });
  f.profiles.set(validClientId, { id: validClientId, role: 'client', is_active: true });

  // 1. Authorized admin caller attempts to deactivate target admin -> refused
  f.session = { userId: adminId, role: 'admin' };
  const targetAdminDeact = await setClientActiveAction(targetAdminId, false);
  assert.equal(targetAdminDeact.error, 'Client not found.');
  assert.equal(f.profiles.get(targetAdminId).is_active, true);

  // 2. Admin caller attempts self-deactivation -> refused
  const selfDeact = await setClientActiveAction(adminId, false);
  assert.equal(selfDeact.error, 'Client not found.');
  assert.equal(f.profiles.get(adminId).is_active, true);

  // 3. Client caller attempts to call setClientActiveAction -> unauthorized
  f.session = { userId: validClientId, role: 'client' };
  const unauthClient = await setClientActiveAction(validClientId, false);
  assert.equal(unauthClient.error, 'Unauthorized.');

  // 4. Inactive admin caller attempts to call action -> unauthorized
  f.session = { userId: adminId, role: 'admin' };
  f.profiles.get(adminId).is_active = false;
  const unauthInactiveAdmin = await setClientActiveAction(validClientId, false);
  assert.equal(unauthInactiveAdmin.error, 'Unauthorized.');
  f.profiles.get(adminId).is_active = true;

  // 5. Authorized admin caller deactivates valid client -> succeeds
  const validDeact = await setClientActiveAction(validClientId, false);
  assert.deepEqual(validDeact, {});
  assert.equal(f.profiles.get(validClientId).is_active, false);
});

// --------------------------------------------------------------------------
// SUITE 3: Lead Conversion Boundary Against Privileged Accounts
// --------------------------------------------------------------------------

test('lead conversion: refuses to convert lead whose email belongs to an administrator', async () => {
  resetState();
  const adminId = 'lead-clash-admin';
  const adminEmail = 'clash-admin@example.test';
  f.users.set(adminId, { id: adminId, email: adminEmail, app_metadata: { role: 'admin' } });
  f.profiles.set(adminId, { id: adminId, role: 'admin', is_active: true, full_name: 'Lead Admin', company: 'Admin LLC' });

  const leadId = 'lead-clash-1';
  f.leads.set(leadId, {
    id: leadId,
    email: adminEmail,
    name: 'Malicious Onboarding Name',
    company: 'Malicious Corp',
    converted_client_id: null,
    status: 'new',
  });

  const res = await convertLead(leadId, 'https://example.test');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'That email belongs to an admin account.');

  // Verify lead is untouched
  const leadAfter = f.leads.get(leadId);
  assert.equal(leadAfter.converted_client_id, null);
  assert.equal(leadAfter.status, 'new');

  // Verify admin account is untouched
  const adminAfter = f.profiles.get(adminId);
  assert.equal(adminAfter.role, 'admin');
  assert.equal(adminAfter.full_name, 'Lead Admin');
  assert.equal(adminAfter.company, 'Admin LLC');
});

test('lead conversion: rejects already converted lead and invalid emails', async () => {
  resetState();
  const leadId = 'lead-already-done';
  f.leads.set(leadId, { id: leadId, email: 'user@example.test', converted_client_id: 'client-99', status: 'won' });

  const res = await convertLead(leadId, 'https://example.test');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'This lead was already converted.');

  const invalidLeadId = 'lead-bad-email';
  f.leads.set(invalidLeadId, { id: invalidLeadId, email: 'not-an-email', converted_client_id: null, status: 'new' });

  const resBad = await convertLead(invalidLeadId, 'https://example.test');
  assert.equal(resBad.ok, false);
  assert.equal(resBad.error, 'Lead has no usable email address.');
});

// --------------------------------------------------------------------------
// SUITE 4: Fail-Closed Behavior on Partial Auth/Database Failures
// --------------------------------------------------------------------------

test('fail-closed: deactivation keeps profile inactive if Auth ban fails', async () => {
  resetState();
  const clientId = 'client-fail-ban';
  f.users.set(clientId, { id: clientId, email: 'fail-ban@example.test', app_metadata: { role: 'client' } });
  f.profiles.set(clientId, { id: clientId, role: 'client', is_active: true });

  // Simulate Auth service failure on updateUserById
  f.authUpdateError = { message: 'auth-service-timeout-leak-forbidden' };

  const res = await setClientActive(clientId, false);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Portal access is disabled. Sign-in blocking failed; retry deactivation.');
  // Internal error details must NOT leak
  assert.equal(res.error.includes('auth-service-timeout'), false);

  // Profile must remain inactive (fail-closed)
  assert.equal(f.profiles.get(clientId).is_active, false);
});

test('fail-closed: reactivation refuses to activate profile if Auth unban fails', async () => {
  resetState();
  const clientId = 'client-fail-unban';
  f.users.set(clientId, { id: clientId, email: 'fail-unban@example.test', app_metadata: { role: 'client' } });
  f.profiles.set(clientId, { id: clientId, role: 'client', is_active: false });

  // Simulate Auth service failure during unban
  f.authUpdateError = { message: 'auth-provider-500' };

  const res = await setClientActive(clientId, true);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Reactivation failed. Account remains disabled.');
  assert.equal(res.error.includes('auth-provider'), false);

  // Profile must NEVER have been set to active
  assert.equal(f.profiles.get(clientId).is_active, false);
  assert.equal(f.calls.profileUpdates.length, 0);
});

// --------------------------------------------------------------------------
// SUITE 5: Session Authority & Dual Store Role Synchronization
// --------------------------------------------------------------------------

test('session authority: getCurrentSession returns null on role drift, inactive state, or missing claims', async () => {
  resetState();

  // 1. Valid synchronized admin session
  f.serverClientClaims = {
    data: { claims: { sub: 'admin-valid', email: 'admin@example.test', app_metadata: { role: 'admin' } } },
    error: null,
  };
  f.serverClientProfile = { role: 'admin', is_active: true };
  const validAdmin = await realGetCurrentSession();
  assert.deepEqual(validAdmin, { userId: 'admin-valid', email: 'admin@example.test', role: 'admin' });

  // 2. Valid synchronized client session
  f.serverClientClaims = {
    data: { claims: { sub: 'client-valid', email: 'client@example.test', app_metadata: { role: 'client' } } },
    error: null,
  };
  f.serverClientProfile = { role: 'client', is_active: true };
  const validClient = await realGetCurrentSession();
  assert.deepEqual(validClient, { userId: 'client-valid', email: 'client@example.test', role: 'client' });

  // 3. Drift: Auth claim says admin, database profile says client
  f.serverClientClaims = {
    data: { claims: { sub: 'drift-user-1', email: 'drift1@example.test', app_metadata: { role: 'admin' } } },
    error: null,
  };
  f.serverClientProfile = { role: 'client', is_active: true };
  assert.equal(await realGetCurrentSession(), null);

  // 4. Drift: Auth claim says client, database profile says admin
  f.serverClientClaims = {
    data: { claims: { sub: 'drift-user-2', email: 'drift2@example.test', app_metadata: { role: 'client' } } },
    error: null,
  };
  f.serverClientProfile = { role: 'admin', is_active: true };
  assert.equal(await realGetCurrentSession(), null);

  // 5. Inactive admin profile in DB
  f.serverClientClaims = {
    data: { claims: { sub: 'inactive-admin', email: 'admin@example.test', app_metadata: { role: 'admin' } } },
    error: null,
  };
  f.serverClientProfile = { role: 'admin', is_active: false };
  assert.equal(await realGetCurrentSession(), null);

  // 6. Inactive client profile in DB
  f.serverClientClaims = {
    data: { claims: { sub: 'inactive-client', email: 'client@example.test', app_metadata: { role: 'client' } } },
    error: null,
  };
  f.serverClientProfile = { role: 'client', is_active: false };
  assert.equal(await realGetCurrentSession(), null);

  // 7. Unknown role claim (e.g. 'superadmin' or non-standard string)
  f.serverClientClaims = {
    data: { claims: { sub: 'unknown-role', email: 'user@example.test', app_metadata: { role: 'superadmin' } } },
    error: null,
  };
  f.serverClientProfile = { role: 'superadmin', is_active: true };
  assert.equal(await realGetCurrentSession(), null);

  // 8. Missing email or sub in claims
  f.serverClientClaims = {
    data: { claims: { sub: '', email: 'admin@example.test', app_metadata: { role: 'admin' } } },
    error: null,
  };
  assert.equal(await realGetCurrentSession(), null);
  f.serverClientClaims = {
    data: { claims: { sub: 'admin-id', email: '', app_metadata: { role: 'admin' } } },
    error: null,
  };
  assert.equal(await realGetCurrentSession(), null);
});

// --------------------------------------------------------------------------
// SUITE 6: Directory & Client Listing Separation
// --------------------------------------------------------------------------

test('directory separation: listClients queries only client roles and hides administrators', async () => {
  resetState();
  // Add 2 admins and 2 clients
  f.users.set('admin-1', { id: 'admin-1', email: 'admin1@example.test', app_metadata: { role: 'admin' } });
  f.profiles.set('admin-1', { id: 'admin-1', role: 'admin', is_active: true, full_name: 'Admin One', company: 'Admin Corp' });

  f.users.set('admin-2', { id: 'admin-2', email: 'admin2@example.test', app_metadata: { role: 'admin' } });
  f.profiles.set('admin-2', { id: 'admin-2', role: 'admin', is_active: true, full_name: 'Admin Two', company: 'Admin Corp' });

  f.users.set('client-1', { id: 'client-1', email: 'client1@example.test', app_metadata: { role: 'client' } });
  f.profiles.set('client-1', { id: 'client-1', role: 'client', is_active: true, full_name: 'Client One', company: 'Client Co' });

  f.users.set('client-2', { id: 'client-2', email: 'client2@example.test', app_metadata: { role: 'client' } });
  f.profiles.set('client-2', { id: 'client-2', role: 'client', is_active: true, full_name: 'Client Two', company: 'Client LLC' });

  const clients = await listClients();
  assert.equal(clients.length, 2);
  const emails = clients.map((c) => c.email);
  assert.ok(emails.includes('client1@example.test'));
  assert.ok(emails.includes('client2@example.test'));
  assert.ok(!emails.includes('admin1@example.test'));
  assert.ok(!emails.includes('admin2@example.test'));
});

// --------------------------------------------------------------------------
// SUITE 7: Profile Field Scoping During Onboarding
// --------------------------------------------------------------------------

test('profile field scoping: inviteClient profile updates cannot mutate admin profiles and fail closed', async () => {
  resetState();
  // Valid new client invitation with fullName and company
  const res = await inviteClient({
    email: 'new-client@example.test',
    fullName: 'Fresh Client',
    company: 'Fresh Co',
    redirectToBase: 'https://example.test',
  });
  assert.equal(res.ok, true);

  // When profile update fails during invite, it returns safe guidance
  resetState();
  f.profileUpdateError = { message: 'db-connection-failed-private' };
  const failRes = await inviteClient({
    email: 'fail-update@example.test',
    fullName: 'Fresh Client',
    company: 'Fresh Co',
    redirectToBase: 'https://example.test',
  });
  assert.equal(failRes.ok, false);
  assert.equal(failRes.error, 'Account exists. Update its profile from Clients before continuing.');
  assert.equal(failRes.error.includes('db-connection-failed'), false);
});

// --------------------------------------------------------------------------
// SUITE 8: Input Validation for Client Operations
// --------------------------------------------------------------------------

test('input validation: inviteClient rejects invalid emails and oversized strings', async () => {
  resetState();

  // Invalid email inputs
  for (const badEmail of ['', '   ', 'not-an-email', 'missing@domain', '@missing-user.com', 123, null, undefined]) {
    const res = await inviteClient({
      email: badEmail,
      redirectToBase: 'https://example.test',
    });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'Enter a valid email address.');
  }

  // Oversized fullName / company
  const overlong = 'a'.repeat(201);
  const resName = await inviteClient({
    email: 'valid@example.test',
    fullName: overlong,
    redirectToBase: 'https://example.test',
  });
  assert.equal(resName.ok, false);
  assert.equal(resName.error, 'Name and company must be at most 200 characters.');

  const resCompany = await inviteClient({
    email: 'valid@example.test',
    company: overlong,
    redirectToBase: 'https://example.test',
  });
  assert.equal(resCompany.ok, false);
  assert.equal(resCompany.error, 'Name and company must be at most 200 characters.');
});

