import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {archiveFixture,consentBundle} from './consent-fixture.mjs';

const container='supabase_db_redwan-auth-ci';
function sql(text){
 assert.equal(process.env.DISPOSABLE_AUTH_CI,'true');
 const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
 assert.ok(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&url.port==='54321');
 try{return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000}).trim();}
 catch{throw Error('Disposable consent fixture SQL failed');}
}
const q=s=>"'"+s.replaceAll("'","''")+"'";
export function installConsentFixture(){
 // Never adopt an already-active control. The CI stack is a disposable local
 // database; runtime service credentials cannot perform these operator writes.
 assert.equal(sql("select active_version is null from consent_private.control where singleton;"),'t');
 const bundle={...consentBundle,version:'synthetic-f20-'+randomUUID().replaceAll('-','')};
 const archive=archiveFixture(bundle);
 sql('begin;select 1 from consent_private.control where singleton for update;'+
  'insert into consent_private.policy_versions(version,canonical,hash) values('+[archive.version,archive.canonical,archive.hash].map(q).join(',')+');'+
  'update consent_private.control set active_version='+q(archive.version)+' where singleton and active_version is null;commit;');
 assert.equal(sql('select active_version from consent_private.control where singleton;'),archive.version);
 return {bundle,archive,dispose(){
  assert.equal(sql('select active_version from consent_private.control where singleton;'),archive.version);
  sql('update consent_private.control set active_version=null where singleton and active_version='+q(archive.version)+';');
  assert.equal(sql('select active_version is null from consent_private.control where singleton;'),'t');
  // Immutable archive remains until this job destroys its own local stack.
 }};
}
