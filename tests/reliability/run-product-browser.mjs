import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {randomBytes} from 'node:crypto';
for(const file of ['.env','.env.local','.env.production','.env.production.local'])assert.equal(existsSync(file),false);
const status=JSON.parse(readFileSync(process.env.AUTH_STATUS_FILE,'utf8'));const api=new URL(status.API_URL);
assert.ok(['localhost','127.0.0.1'].includes(api.hostname)&&api.protocol==='http:'&&api.port==='54321');assert.ok(status.PUBLISHABLE_KEY.startsWith('sb_publishable_')&&status.SECRET_KEY.startsWith('sb_secret_'));
const env=Object.fromEntries(['PATH','HOME','TMPDIR','BROWSER_TOOLS_DIR','CI'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SITE_URL:'http://localhost:3399',NEXT_PUBLIC_SUPABASE_URL:api.origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY,SUPABASE_SECRET_KEY:status.SECRET_KEY,LEAD_IP_HASH_SALT:randomBytes(32).toString('hex'),DISPOSABLE_AUTH_CI:'true'});
const result=spawnSync(process.execPath,['--test','tests/reliability/product-browser.acceptance.mjs'],{env,encoding:'utf8',maxBuffer:20*1024*1024});
const output=(result.stdout??'')+'\n'+(result.stderr??'');
for(const line of output.split('\n'))if(/^# (tests|pass|fail|cancelled|skipped) \d+$/.test(line))console.log(line);
if(result.status!==0){const phases=['fixtures','startup','client projects','profile edit','mobile layout','foreign project denial','milestone invoice','draft isolation','decimal invoice','cleanup'];const phase=phases.find(p=>output.includes('Product acceptance failed at '+p+';'));console.log('::error::Product browser acceptance failed'+(phase?' at '+phase:''));process.exit(1);}
console.log('Product browser acceptance passed; exact fixture cleanup verified.');
