// Prepare BEFORE entering the internal network. No stack provisioning or acceptance claim.
// Usage: node tests/acceptance/prepare-browser.mjs CANDIDATE NODE_IMAGE@sha256:DIGEST NEW_MANIFEST
// Run from a clean exact-candidate checkout. Requires local Docker, git and tar.
// The base must be a reviewed Debian/Ubuntu Node 22 image with apt-get.
// Put NEW_MANIFEST outside the checkout; its adjacent private build log is retained.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const browserPackage = { name: 'disposable-browser-runtime', version: '1.0.0', private: true,
  dependencies: { 'playwright-core': '1.58.2' } };
// Published npm metadata, retrieved 2026-09-26. No floating browser-package dependency.
export const browserLock = { name: browserPackage.name, version: '1.0.0', lockfileVersion: 3,
  requires: true, packages: {
    '': { name: browserPackage.name, version: '1.0.0', dependencies: browserPackage.dependencies },
    'node_modules/playwright-core': {
      version: '1.58.2', resolved: 'https://registry.npmjs.org/playwright-core/-/playwright-core-1.58.2.tgz',
      integrity: 'sha512-yZkEtftgwS8CsfYo7nm0KE8jsvm6i/PTgVtB8DL726wNf6H2IMsDuxCpJj59KDaxCtSnrWan2AeDqM7JBaultg==',
      license: 'Apache-2.0', bin: { 'playwright-core': 'cli.js' }, engines: { node: '>=18' }
    }
  }
};

export function runnerRecipe({ candidate, baseImage }) {
  assert.match(candidate, /^[a-f0-9]{40}$/);
  assert.match(baseImage, /^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/);
  return `FROM ${baseImage}
LABEL org.opencontainers.image.revision="${candidate}"
LABEL work.redwan.acceptance.browser="1.58.2"
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NEXT_TELEMETRY_DISABLED=1 CI=true
WORKDIR /opt/browser
COPY browser/package.json browser/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && node node_modules/playwright-core/cli.js install --with-deps chromium
WORKDIR /work
COPY source/package.json source/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY source/ ./
RUN node -e "if(process.versions.node.split('.')[0]!=='22')process.exit(1)" && chmod -R a-w /work /opt/browser /opt/pw-browsers
USER 1000:1000
ENV HOME=/tmp
CMD ["node", "-e", "setInterval(()=>{},60000)"]
`;
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function prepareBrowserRunner({ candidate, baseImage, manifestPath }) {
  const dockerfile = runnerRecipe({ candidate, baseImage });
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT, 'Local Docker only');
  assert.ok(manifestPath && !fs.existsSync(manifestPath), 'New manifest path required');
  const relative = path.relative(process.cwd(), path.resolve(manifestPath));
  assert.ok(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), 'Keep private manifest outside the checkout');
  const logPath = `${manifestPath}.build.log`;
  const logFd = fs.openSync(logPath, 'wx', 0o600);
  const run = (bin, args, options = {}) => {
    try { return execFileSync(bin, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 1200000, ...options }); }
    catch (error) {
      fs.writeSync(logFd, error.stdout || '');
      fs.writeSync(logFd, error.stderr || '');
      throw Error(`Runner preparation failed at ${bin}; inspect the private build log.`);
    }
  };
  try {
  const context = JSON.parse(run('docker', ['context', 'inspect']))[0];
  assert.match(context.Endpoints?.docker?.Host || '', /^(unix:\/\/|npipe:\/\/)/);
  assert.equal(run('git', ['rev-parse', 'HEAD']).trim(), candidate, 'Checkout must match candidate');
  assert.equal(run('git', ['status', '--porcelain']).trim(), '', 'Preserve changes: clean checkout required');
  const tracked = run('git', ['ls-tree', '-r', '--name-only', candidate]).trim().split('\n');
  assert.ok(!tracked.some(file => /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example')), 'Tracked environment files forbidden');
  // git archive excludes ignored/untracked .env files, credentials, .git and local build products.
  const archive = run('git', ['archive', '--format=tar', candidate], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-browser-build-'));
  try {
    fs.mkdirSync(path.join(dir, 'source'));
    fs.mkdirSync(path.join(dir, 'browser'));
    run('tar', ['-xf', '-', '-C', path.join(dir, 'source')], { input: archive });
    fs.writeFileSync(path.join(dir, 'Dockerfile'), dockerfile);
    fs.writeFileSync(path.join(dir, 'browser/package.json'), JSON.stringify(browserPackage));
    fs.writeFileSync(path.join(dir, 'browser/package-lock.json'), JSON.stringify(browserLock));
    const iid = path.join(dir, 'image-id');
    const buildOutput = run('docker', ['build', '--pull=false', '--iidfile', iid, dir], { stdio: ['pipe', logFd, logFd] });
    if (buildOutput) fs.writeSync(logFd, buildOutput);
    const imageId = fs.readFileSync(iid, 'utf8').trim();
    assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
    const image = JSON.parse(run('docker', ['image', 'inspect', imageId]))[0];
    assert.equal(image.Id, imageId);
    assert.equal(image.Config.Labels['org.opencontainers.image.revision'], candidate);
    assert.equal(image.Config.User, '1000:1000');
    const manifest = { version: 1, candidate, imageId, baseImage, sourceArchiveSha256: hash(archive),
      recipeSha256: hash(dockerfile), browserLockSha256: hash(JSON.stringify(browserLock)),
      browserVersion: '1.58.2', state: 'built-not-browser-verified',
      runner: { role: 'runner', image: imageId, command: ['node', '-e', 'setInterval(()=>{},60000)'],
        env: {}, tmpfs: ['/tmp:rw,nosuid,nodev,size=512m,uid=1000,gid=1000,mode=0700'], memoryMB: 2048, user: '1000:1000' } };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    return manifest;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } finally { fs.closeSync(logFd); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [candidate, baseImage, manifestPath] = process.argv.slice(2);
    prepareBrowserRunner({ candidate, baseImage, manifestPath });
    console.log('Browser runner built; manifest recorded. Runtime and live acceptance remain unverified.');
  } catch { console.error('Browser runner preparation failed. No stack was started or disposed.'); process.exitCode = 1; }
}
