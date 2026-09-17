import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const EXPECTED_ACTIONS={
 'lib/crm/admin-actions.ts':['convertLeadAction','deleteAssetAction','inviteClientAction','setClientActiveAction','addInvoiceItemAction','confirmPaymentAction','createDraftInvoiceWithItemsAction','deleteInvoiceItemAction','rejectPaymentAction','sendInvoiceAction','updateDraftInvoiceAction','updateInvoiceItemAction','voidInvoiceAction','addMilestoneAction','archiveDownloadUrlAction','archiveProjectAction','confirmDeliverableAction','createProjectAction','deleteFileAction','deleteMilestoneAction','getDeliverablePresignAction','moveMilestoneAction','purgeArchivedProjectAction','setMilestoneStatusAction','updateProjectAction','replyToTicketAction','setTicketStatusAction'],
 'lib/crm/public-asset-actions.ts':['prepareAssetUploadAction','confirmAssetUploadAction'],
 'lib/crm/workflow-actions.ts':['editClientProfileAction','invoiceMilestoneAction'],
 'lib/crm/ticket-upload-actions.ts':['shareTicketFilesAction'],
 'lib/auth/actions.ts':['acceptInviteAction','signInWithPasswordAction','requestMagicLinkAction','requestPasswordResetAction','consumeMagicLinkTokenAction','setNewPasswordFromRecoveryAction'],
 'lib/crm/client-actions.ts':['submitPaymentAction','createTicketWithAttachmentsAction','clientReplyAction'],
};
const EXPECTED_ROUTES=[
 ['app/api/auth/logout/route.ts','/api/auth/logout/route',['GET','POST']],
 ['app/api/contact/route.ts','/api/contact/route',['POST']],
 ['app/api/cron/email-outbox/route.ts','/api/cron/email-outbox/route',['GET']],
 ['app/api/cron/r2-retention/route.ts','/api/cron/r2-retention/route',['GET']],
 ['app/api/files/[id]/download/route.ts','/api/files/[id]/download/route',['GET']],
 ['app/api/revalidate/route.ts','/api/revalidate/route',['POST']],
 ['app/api/uploads/presign/route.ts','/api/uploads/presign/route',['POST']],
 ['app/api/uploads/ticket-presign/route.ts','/api/uploads/ticket-presign/route',['POST']],
 ['app/api/recovery/route.ts','/api/recovery/route',['GET','POST']],
];
const refPath=resolve('.next/server/server-reference-manifest.json'),appPath=resolve('.next/server/app-paths-manifest.json');
assert.ok(existsSync(refPath)&&existsSync(appPath),'Built manifests required; run npm run build first.');
const refs=JSON.parse(readFileSync(refPath,'utf8')),paths=JSON.parse(readFileSync(appPath,'utf8'));const entries=Object.values(refs.node||{}),found=new Map();
for(const entry of entries){assert.ok(entry.filename);assert.ok(entry.exportedName);const file=entry.filename.replace(/\\/g,'/');if(!found.has(file))found.set(file,new Set());found.get(file).add(entry.exportedName);}
let count=0;for(const [file,actions]of Object.entries(EXPECTED_ACTIONS)){assert.ok(found.has(file),`Missing action file ${file}`);for(const action of actions){count++;assert.ok(found.get(file).has(action),`Missing action ${file}:${action}`);}}
assert.equal(entries.length,count,'Unexpected server action population');
for(const [file,key,methods]of EXPECTED_ROUTES){assert.ok(paths[key],`Missing route ${key}`);assert.ok(existsSync(file));const source=readFileSync(file,'utf8');for(const method of methods)assert.match(source,new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`));}
assert.deepEqual(Object.keys(paths).filter(k=>k.startsWith('/api/')&&k.endsWith('/route')).sort(),EXPECTED_ROUTES.map(([,key])=>key).sort(),'Unexpected API route population');
console.log(`Passed: Manifest audit verified ${entries.length} server actions and ${EXPECTED_ROUTES.length} API routes against built manifests.`);
