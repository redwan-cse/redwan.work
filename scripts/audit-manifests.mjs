import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED_ACTIONS = {
  'lib/crm/admin-actions.ts': [
    'convertLeadAction',
    'deleteAssetAction',
    'inviteClientAction',
    'setClientActiveAction',
    'addInvoiceItemAction',
    'confirmPaymentAction',
    'createDraftInvoiceWithItemsAction',
    'deleteInvoiceItemAction',
    'rejectPaymentAction',
    'sendInvoiceAction',
    'updateDraftInvoiceAction',
    'updateInvoiceItemAction',
    'voidInvoiceAction',
    'addMilestoneAction',
    'archiveDownloadUrlAction',
    'archiveProjectAction',
    'confirmDeliverableAction',
    'createProjectAction',
    'deleteFileAction',
    'deleteMilestoneAction',
    'getDeliverablePresignAction',
    'moveMilestoneAction',
    'purgeArchivedProjectAction',
    'setMilestoneStatusAction',
    'updateProjectAction',
    'replyToTicketAction',
    'setTicketStatusAction',
  ],
  'lib/crm/public-asset-actions.ts': [
    'prepareAssetUploadAction',
    'confirmAssetUploadAction',
  ],
  'lib/crm/workflow-actions.ts': [
    'editClientProfileAction',
    'invoiceMilestoneAction',
  ],
  'lib/crm/ticket-upload-actions.ts': [
    'shareTicketFilesAction',
  ],
  'lib/auth/actions.ts': [
    'acceptInviteAction',
    'signInWithPasswordAction',
    'requestMagicLinkAction',
    'requestPasswordResetAction',
    'consumeMagicLinkTokenAction',
    'setNewPasswordFromRecoveryAction',
  ],
  'lib/crm/client-actions.ts': [
    'submitPaymentAction',
    'createTicketWithAttachmentsAction',
    'clientReplyAction',
  ],
};

const EXPECTED_ROUTES = [
  { path: 'app/api/auth/logout/route.ts', manifestKey: '/api/auth/logout/route', methods: ['GET', 'POST'] },
  { path: 'app/api/contact/route.ts', manifestKey: '/api/contact/route', methods: ['POST'] },
  { path: 'app/api/cron/email-outbox/route.ts', manifestKey: '/api/cron/email-outbox/route', methods: ['GET'] },
  { path: 'app/api/cron/r2-retention/route.ts', manifestKey: '/api/cron/r2-retention/route', methods: ['GET'] },
  { path: 'app/api/files/[id]/download/route.ts', manifestKey: '/api/files/[id]/download/route', methods: ['GET'] },
  { path: 'app/api/revalidate/route.ts', manifestKey: '/api/revalidate/route', methods: ['POST'] },
  { path: 'app/api/uploads/presign/route.ts', manifestKey: '/api/uploads/presign/route', methods: ['POST'] },
  { path: 'app/api/uploads/ticket-presign/route.ts', manifestKey: '/api/uploads/ticket-presign/route', methods: ['POST'] },
];

function main() {
  const refManifestPath = resolve(process.cwd(), '.next/server/server-reference-manifest.json');
  if (!existsSync(refManifestPath)) {
    console.error('::error::Server reference manifest missing at ' + refManifestPath + '. Run npm run build first.');
    process.exit(1);
  }

  const pathsManifestPath = resolve(process.cwd(), '.next/server/app-paths-manifest.json');
  if (!existsSync(pathsManifestPath)) {
    console.error('::error::App paths manifest missing at ' + pathsManifestPath + '. Run npm run build first.');
    process.exit(1);
  }

  const refManifest = JSON.parse(readFileSync(refManifestPath, 'utf8'));
  const pathsManifest = JSON.parse(readFileSync(pathsManifestPath, 'utf8'));
  const entries = Object.values(refManifest.node || {});

  const foundByFile = new Map();
  for (const entry of entries) {
    assert.ok(entry.filename, 'Manifest entry missing filename');
    assert.ok(entry.exportedName, 'Manifest entry missing exportedName');
    const norm = entry.filename.replace(/\\/g, '/');
    if (!foundByFile.has(norm)) foundByFile.set(norm, new Set());
    foundByFile.get(norm).add(entry.exportedName);
  }

  let totalExpectedActions = 0;
  for (const [file, actions] of Object.entries(EXPECTED_ACTIONS)) {
    const foundActions = foundByFile.get(file);
    if (!foundActions) {
      console.error(`::error::Manifest missing all actions for ${file}`);
      process.exit(1);
    }
    for (const action of actions) {
      totalExpectedActions++;
      if (!foundActions.has(action)) {
        console.error(`::error::Manifest missing action ${action} in ${file}`);
        process.exit(1);
      }
    }
  }

  assert.equal(entries.length, totalExpectedActions, `Expected exactly ${totalExpectedActions} actions in manifest, found ${entries.length}`);

  // Check all 8 API routes in app-paths-manifest and source export methods
  for (const route of EXPECTED_ROUTES) {
    if (!pathsManifest[route.manifestKey]) {
      console.error(`::error::App paths manifest missing route ${route.manifestKey}`);
      process.exit(1);
    }
    const fullPath = resolve(process.cwd(), route.path);
    if (!existsSync(fullPath)) {
      console.error(`::error::Route source file missing at ${route.path}`);
      process.exit(1);
    }
    const content = readFileSync(fullPath, 'utf8');
    for (const method of route.methods) {
      const pattern = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`);
      if (!pattern.test(content)) {
        console.error(`::error::Route ${route.path} missing exported function ${method}`);
        process.exit(1);
      }
    }
  }

  console.log(`Passed: Manifest audit verified ${entries.length} server actions and ${EXPECTED_ROUTES.length} API routes against built manifests.`);
}

main();
