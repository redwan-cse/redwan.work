import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { deflateRawSync } from 'node:zlib';
const hooks=registerHooks({resolve(s,c,n){return s==='server-only'?{url:'data:text/javascript,export {};',shortCircuit:true}:n(s,c);}});
const {encodeRecoveryArchive,decodeRecoveryArchive,RECOVERY_MAX_BYTES}=await import('../../lib/crm/recovery-archive.ts');
hooks.deregister();
const id='11111111-1111-4111-8111-111111111111';
const entries=[{name:'recovery.json',bytes:Buffer.from('{"version":1,"synthetic":true}')},{name:`files/${id}`,bytes:Buffer.from([0,1,2,255,42])}];
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
// Independent ZIP fixture producer exercises stored/deflated and descriptor
// compatibility, rather than deriving every fixture through the implementation.
function fixture({name='recovery.json',data=Buffer.from('{"synthetic":true}'),method=0,flags=0,attrs=0,comment='',descriptor=false}={}){
 const n=Buffer.from(name),payload=method===8?deflateRawSync(data):data;
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(flags|(descriptor?8:0),6);local.writeUInt16LE(method,8);local.writeUInt32LE(descriptor?0:crc(data),14);local.writeUInt32LE(descriptor?0:payload.length,18);local.writeUInt32LE(descriptor?0:data.length,22);local.writeUInt16LE(n.length,26);
 const dd=descriptor?Buffer.alloc(16):Buffer.alloc(0);if(descriptor){dd.writeUInt32LE(0x08074b50);dd.writeUInt32LE(crc(data),4);dd.writeUInt32LE(payload.length,8);dd.writeUInt32LE(data.length,12);}
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE((3<<8)|20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(flags|(descriptor?8:0),8);central.writeUInt16LE(method,10);central.writeUInt32LE(crc(data),16);central.writeUInt32LE(payload.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(attrs>>>0,38);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+n.length,12);end.writeUInt32LE(local.length+n.length+payload.length+dd.length,16);const cm=Buffer.from(comment);end.writeUInt16LE(cm.length,20);
 return Buffer.concat([local,n,payload,dd,central,n,end,cm]);
}
function rejected(bytes){assert.throws(()=>decodeRecoveryArchive(bytes),/Recovery archive/);}
test('backup round trip preserves manifest and exact binary bytes',()=>{
 const zip=encodeRecoveryArchive(entries),read=decodeRecoveryArchive(zip);assert.equal(zip.readUInt32LE(0),0x04034b50);assert.equal(read.size,2);for(const e of entries)assert.deepEqual(read.get(e.name),e.bytes);
});
test('independently generated stored ZIP is accepted',()=>{assert.deepEqual(decodeRecoveryArchive(fixture()).get('recovery.json'),Buffer.from('{"synthetic":true}'));});
test('legacy deflated ZIP with signed descriptor is accepted',()=>{assert.deepEqual(decodeRecoveryArchive(fixture({method:8,descriptor:true})).get('recovery.json'),Buffer.from('{"synthetic":true}'));});
for(const name of ['../escape','/absolute','C:/escape','files/../escape','files\\escape','files/','file.txt','files/not-a-uuid'])test(`unsafe or unknown path ${name} is refused`,()=>rejected(fixture({name})));
test('duplicate entries and empty archives are refused on encode',()=>{assert.throws(()=>encodeRecoveryArchive([]));assert.throws(()=>encodeRecoveryArchive([entries[0],entries[0]]));});
test('encrypted unsupported-method and symlink archives are refused',()=>{rejected(fixture({flags:1}));rejected(fixture({method:99}));rejected(fixture({attrs:0xa1ff<<16}));});
test('compressed payload corruption and wrong CRC fail closed',()=>{const b=fixture();b[30+'recovery.json'.length]^=255;rejected(b);});
test('local-central filename mismatch is refused',()=>{const b=fixture();b[30]=120;rejected(b);});
test('local-central length mismatch is refused',()=>{const b=fixture();b.writeUInt32LE(1,22);rejected(b);});
test('truncation suffix and non-ZIP inputs are refused',()=>{const b=fixture();rejected(b.subarray(0,b.length-1));rejected(Buffer.concat([b,Buffer.from('extra')]));rejected(Buffer.from('not a zip'));});
test('oversized declared expansion is refused before inflate',()=>{const b=fixture({method:8});const e=b.length-22,c=b.readUInt32LE(e+16);b.writeUInt32LE(RECOVERY_MAX_BYTES+1,c+24);rejected(b);});
test('noncanonical comments and multipart ZIP metadata are refused',()=>{rejected(fixture({comment:'synthetic'}));const b=fixture();b.writeUInt16LE(1,b.length-18);rejected(b);});
test('central offsets cannot alias headers or overlap directory',()=>{const b=fixture(),e=b.length-22,c=b.readUInt32LE(e+16);b.writeUInt32LE(c,c+42);rejected(b);});
test('invalid descriptor sizes are refused',()=>{const b=fixture({method:8,descriptor:true});const c=b.readUInt32LE(b.length-6);b.writeUInt32LE(999,c-4);rejected(b);});
test('legacy project manifests are preserved as data, not filesystem paths',()=>{
 const source=['project.json','milestones.json','files.json','recovery.json'].map(name=>({name,bytes:Buffer.from('{}')}));assert.equal(decodeRecoveryArchive(encodeRecoveryArchive(source)).size,4);
});
