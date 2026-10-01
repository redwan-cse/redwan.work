// Phase B owned-container launcher. Node 22+, Docker Engine, no npm dependencies.
// Host/Docker administrator and prepared images are trusted. Tests are not a hostile-code sandbox.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'work.redwan.phase-b';
const ROLES = ['database', 'gateway', 'auth', 'rest', 'storage', 'app', 'runner'];
const SESSION = '/tmp/phase-b-session.json';
export const docker = (...args) => {
  try { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 }).trim(); }
  catch { throw new Error(`Docker operation failed (${args[0]}); inspect locally without publishing secrets.`); }
};
const json = (d, ...a) => JSON.parse(d(...a));
const inspect = (d, type, id) => json(d, type, 'inspect', id)[0];
const requireValue = (value, message) => assert.ok(value, message);

export function validatePlan(plan) {
  requireValue(plan?.version === 1 && /^[a-f0-9]{40}$/.test(plan.candidate), 'Exact candidate required');
  requireValue(Array.isArray(plan.services) && plan.services.length >= ROLES.length, 'Service plan required');
  const byRole = new Map();
  for (const s of plan.services) {
    requireValue(/^[a-z][a-z0-9-]*$/.test(s.role) && !byRole.has(s.role), 'Unique safe role required');
    // Local builds have immutable image IDs but need not be pushed to any registry.
    requireValue(/^(?:[a-z0-9./:_-]+@)?sha256:[a-f0-9]{64}$/.test(s.image), 'Images must be content addressed');
    requireValue(Array.isArray(s.command) && s.command.every(v => typeof v === 'string'), 'Explicit command array required');
    requireValue(s.env && Object.entries(s.env).every(([k,v]) => /^[A-Z_][A-Z0-9_]*$/.test(k) && typeof v === 'string' && !v.includes('\0')), 'Explicit environment required');
    requireValue(!['mounts','volumes','ports','privileged','network','devices','dockerSocket'].some(k => k in s), 'Host access options forbidden');
    requireValue(Array.isArray(s.tmpfs) && s.tmpfs.every(t => /^\/[a-zA-Z0-9/_-]+:rw,nosuid,nodev,size=\d+[mg](,uid=\d+,gid=\d+,mode=0[0-7]{3})?$/.test(t)), 'Bounded tmpfs specifications required');
    requireValue(Number.isInteger(s.memoryMB) && s.memoryMB >= 128 && s.memoryMB <= 16384, 'Memory limit required');
    byRole.set(s.role, s);
  }
  for (const role of ROLES) requireValue(byRole.has(role), `Missing ${role}`);
  const cfg = plan.acceptance;
  requireValue(cfg && cfg.DISPOSABLE_AUTH_CI === 'true', 'Explicit acceptance opt-in required');
  for (const [key, role] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL:'gateway', R2_ENDPOINT:'storage', APP_URL:'app'
  })) {
    const u = new URL(cfg[key]);
    requireValue(u.protocol === 'http:' && u.hostname === role && u.port && u.pathname === '/' && !u.username && !u.password && !u.search && !u.hash, `Internal ${key} required`);
  }
  for (const k of ['R2_PRIVATE_BUCKET','R2_PUBLIC_BUCKET']) requireValue(/^synthetic-[a-z0-9-]+$/.test(cfg[k]), `Synthetic bucket required: ${k}`);
  requireValue(cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'), 'Current publishable key required');
  requireValue(cfg.SUPABASE_SECRET_KEY?.startsWith('sb_secret_'), 'Current secret key required');
  for (const k of ['R2_PRIVATE_ACCESS_KEY_ID','R2_PRIVATE_SECRET_ACCESS_KEY','R2_PUBLIC_ACCESS_KEY_ID','R2_PUBLIC_SECRET_ACCESS_KEY','LEAD_IP_HASH_SALT']) requireValue(typeof cfg[k] === 'string' && cfg[k].length >= 8, `Ephemeral ${k} required`);
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','R2_ENDPOINT','R2_PRIVATE_BUCKET','R2_PUBLIC_BUCKET','R2_PRIVATE_ACCESS_KEY_ID','R2_PRIVATE_SECRET_ACCESS_KEY','R2_PUBLIC_ACCESS_KEY_ID','R2_PUBLIC_SECRET_ACCESS_KEY','LEAD_IP_HASH_SALT']) {
    requireValue(byRole.get('app').env[k] === cfg[k], `App/test configuration mismatch: ${k}`);
  }
  requireValue(byRole.get('app').env.NEXT_PUBLIC_SITE_URL === cfg.APP_URL, 'Synthetic site URL required');
  return plan;
}

export function verifyOwnedRun(state, d = docker) {
  requireValue(state?.version === 1 && /^test-run-[a-f0-9-]{36}$/.test(state.runId), 'Owned run required');
  requireValue(Array.isArray(state.services) && ROLES.every(role=>state.services.filter(s=>s.role===role).length===1), 'Required owned service missing');
  const n = inspect(d, 'network', state.networkId);
  requireValue(n.Id === state.networkId && n.Internal === true && n.Driver === 'bridge' && n.Labels?.[LABEL] === state.runId, 'Network ownership/isolation mismatch');
  const known = state.services.map(s => s.id).sort();
  assert.deepEqual(Object.keys(n.Containers || {}).sort(), known, 'Unexpected/missing network member');
  for (const service of state.services) {
    const c = inspect(d, 'container', service.id);
    requireValue(c.Id === service.id && c.Config.Labels?.[LABEL] === state.runId && c.Config.Labels?.[`${LABEL}.role`] === service.role, 'Container ownership mismatch');
    requireValue(c.Image === service.imageId && c.State.Running === true, 'Container image/state changed');
    requireValue(!c.HostConfig.Privileged && !c.HostConfig.PublishAllPorts && !c.HostConfig.Binds?.length && !c.HostConfig.Devices?.length, 'Host access forbidden');
    requireValue(!c.HostConfig.CapAdd?.length && c.HostConfig.CapDrop?.includes('ALL') && c.HostConfig.SecurityOpt?.includes('no-new-privileges'), 'Container privilege settings changed');
    requireValue(!c.HostConfig.ExtraHosts?.length && c.HostConfig.Dns?.length===1 && c.HostConfig.Dns[0]==='127.0.0.1', 'External DNS/host mapping forbidden');
    requireValue(!['host','container'].some(x => String(c.HostConfig.PidMode).startsWith(x)), 'Shared host PID namespace forbidden');
    requireValue(!Object.keys(c.HostConfig.PortBindings || {}).length, 'Published ports forbidden');
    if (service.role === 'runner' && c.Config.Labels?.['work.redwan.acceptance.browser']) {
      requireValue(c.HostConfig.ReadonlyRootfs === true, 'Prepared browser runner must be read-only');
      requireValue((c.Mounts || []).every(m => m.Type === 'tmpfs' && m.Destination === '/tmp'), 'Browser runner may only mount /tmp');
    }
    requireValue((c.Mounts || []).every(m => m.Type === 'tmpfs'), 'Persistent/bind mount forbidden');
    const nets = Object.values(c.NetworkSettings.Networks || {});
    requireValue(nets.length === 1 && nets[0].NetworkID === state.networkId, 'Container attached outside owned network');
    requireValue(nets[0].Aliases?.includes(service.role), 'Internal service alias missing');
  }
  return true;
}

// All resources are created by this process. Existing services/volumes/markers are never adopted.
export function provision(plan, statePath, d = docker, afterStart = () => {}) {
  validatePlan(plan);
  requireValue(!fs.existsSync(statePath), 'State file already exists');
  // Deliberately use a local Docker daemon only. Remote contexts are outside this package's contract.
  requireValue(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT, 'Unset Docker endpoint overrides');
  const context = json(d, 'context', 'inspect')[0];
  requireValue(/^(unix:\/\/|npipe:\/\/)/.test(context.Endpoints?.docker?.Host || ''), 'Local Docker context required');
  for (const s of plan.services) {
    const image=inspect(d, 'image', s.image);
    if(['app','runner'].includes(s.role)) requireValue(image.Config.Labels?.['org.opencontainers.image.revision']===plan.candidate,'Prepared app/runner image candidate mismatch');
  }
  const runId = `test-run-${randomUUID()}`;
  const state = { version: 1, runId, candidate: plan.candidate, networkId: null, services: [], acceptance: plan.acceptance, phase: 'creating' };
  fs.mkdirSync(path.dirname(path.resolve(statePath)), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state,null,2), { flag:'wx', mode:0o600 });
  const save = () => fs.writeFileSync(statePath, JSON.stringify(state,null,2), { mode:0o600 });
  try {
    state.networkId = d('network','create','--internal','--driver','bridge','--label',`${LABEL}=${runId}`,runId);
    save();
    for (const s of plan.services) {
      const image = inspect(d, 'image', s.image);
      // Dockerfile VOLUME declarations otherwise create anonymous persistent volumes.
      for (const mount of Object.keys(image.Config.Volumes || {})) {
        requireValue(s.tmpfs.some(t => t.split(':')[0] === mount), `Image volume must be covered by tmpfs: ${s.role}`);
      }
      const args = ['container','create','--pull=never','--name',`${runId}-${s.role}`,
        '--label',`${LABEL}=${runId}`,'--label',`${LABEL}.role=${s.role}`,
        '--network',state.networkId,'--network-alias',s.role,
        '--dns','127.0.0.1',
        '--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=512',
        '--memory',`${s.memoryMB}m`];
      if(s.user) {
        requireValue(/^\d+:\d+$/.test(s.user),'Runtime user must be numeric UID:GID');
        args.push('--user',s.user);
      }
      if (s.role === 'runner' && image.Config.Labels?.['work.redwan.acceptance.browser']) {
        requireValue(s.tmpfs.every(t => t.split(':')[0] === '/tmp'), 'Prepared runner may only mount /tmp');
        args.push('--read-only');
      }
      for (const t of s.tmpfs) args.push('--tmpfs',t);
      // Only this plan's environment is passed. Host .env and ambient secrets are not inherited.
      for (const [k,v] of Object.entries(s.env)) args.push('--env',`${k}=${v}`);
      args.push(s.image,...s.command);
      const id = d(...args);
      state.services.push({role:s.role,id,imageId:image.Id});
      save();
      d('container','start',id);
      // Trusted host-side bootstrap only, not executable plan data. A thrown failure
      // stops dependent services; the exact partial resource inventory is retained.
      const initialized = afterStart({ service: s, state });
      requireValue(!initialized || typeof initialized.then !== 'function', 'Startup hook must be synchronous');
    }
    verifyOwnedRun(state,d);
    state.phase = 'provisioned-not-accepted'; save();
    return {runId, candidate:state.candidate, phase:state.phase};
  } catch (error) {
    state.phase = 'failed-retained'; save();
    // No implicit destructive cleanup. Keep IDs for exact, separately approved disposal.
    throw new Error(`Provisioning stopped; owned resources retained in private state. ${error.message}`);
  }
}

export function assertTestCommand(args) {
  requireValue(args.length >= 3 && args[0] === 'node' && args[1] === '--test', 'Only explicit Node acceptance tests supported');
  requireValue(args.slice(2).every(p => /^tests\/acceptance\/[a-z0-9-]+\.mjs$/.test(p)), 'Explicit acceptance file paths required');
}

export function runTests(state, args, d = docker, spawn = spawnSync) {
  assertTestCommand(args);
  verifyOwnedRun(state,d);
  const runner = state.services.find(s => s.role === 'runner');
  requireValue(runner, 'Runner required');
  const session = { version:1, runId:state.runId, candidate:state.candidate, env:state.acceptance,
    runnerId:runner.id, networkId:state.networkId };
  // The trusted host launcher writes the session directly into the owned runner.
  // This is not a marker used to infer resource ownership: Docker checks already established it.
  const launcher = `
    const fs=require('fs'), cp=require('child_process');
    const data=JSON.parse(fs.readFileSync(0,'utf8'));
    fs.writeFileSync('${SESSION}',JSON.stringify(data.session),{mode:0o600});
    const env={PATH:process.env.PATH,HOME:'/tmp',CI:'true',NEXT_TELEMETRY_DISABLED:'1',
      ...data.session.env,DISPOSABLE_RUN_ID:data.session.runId};
    const r=cp.spawnSync(data.args[0],data.args.slice(1),{env,stdio:'inherit'});
    process.exit(r.status ?? 1);
  `;
  const r = spawn('docker',['exec','-i',runner.id,'node','-e',launcher], {
    input:JSON.stringify({session,args}), encoding:'utf8', maxBuffer:32*1024*1024, timeout:1800000
  });
  requireValue(!r.error, 'Runner execution unavailable');
  return r;
}

export function dispose(state, confirmation, d = docker) {
  requireValue(confirmation === state.runId, 'Exact run ID confirmation required');
  // Permit stopped or partially created resources, but inspect exact ownership before touching anything.
  for (const s of state.services) {
    const c = inspect(d,'container',s.id);
    requireValue(c.Id === s.id && c.Config.Labels?.[LABEL] === state.runId, 'Disposal ownership mismatch');
  }
  if (state.networkId) {
    const n = inspect(d,'network',state.networkId);
    requireValue(n.Labels?.[LABEL] === state.runId, 'Disposal network mismatch');
    requireValue(Object.keys(n.Containers || {}).every(id => state.services.some(s=>s.id===id)), 'Unknown network member; stop');
  }
  for (const s of state.services) d('container','rm','--force',s.id);
  if (state.networkId) d('network','rm',state.networkId);
  // docker rm success establishes removal; explicit list read-back checks exact IDs as well.
  const remaining = d('container','ls','--all','--no-trunc','--format','{{.ID}}').split('\n');
  requireValue(state.services.every(s=>!remaining.includes(s.id)), 'Container still exists');
  const networks = d('network','ls','--no-trunc','--format','{{.ID}}').split('\n');
  requireValue(!networks.includes(state.networkId), 'Network still exists');
  return {runId:state.runId, disposed:true};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, source, ...rest] = process.argv.slice(2);
    const value = JSON.parse(fs.readFileSync(source,'utf8'));
    if (action === 'validate') { validatePlan(value); console.log('Plan shape valid; no resources created.'); }
    else if (action === 'provision') console.log(JSON.stringify(provision(value,rest[0])));
    else if (action === 'check') { verifyOwnedRun(value); console.log('Owned Docker topology verified; acceptance not certified.'); }
    else if (action === 'run') {
      const result = runTests(value,rest);
      // Raw output can contain synthetic secrets from tests. Keep local; sanitize before sharing.
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      process.exitCode = result.status ?? 1;
    } else if (action === 'dispose') console.log(JSON.stringify(dispose(value,rest[0])));
    else throw new Error('Use validate PLAN | provision PLAN PRIVATE_STATE | check STATE | run STATE node --test FILE... | dispose STATE RUN_ID');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
