import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { findFreeLoopbackPort, startLoopbackServices } from './loopback-services.mjs';

function spawnPromise(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function ensurePlaywrightChromium(root, env) {
  const execPath = chromium.executablePath();
  if (execPath && fs.existsSync(execPath)) {
    return;
  }
  console.log('[browser-harness] Playwright Chromium binary missing; installing chromium...');
  const pwCli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
  const installArgs = [
    pwCli,
    'install',
    ...(process.platform === 'linux' ? ['--with-deps'] : []),
    'chromium',
  ];
  const code = await spawnPromise(process.execPath, installArgs, {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (code !== 0) {
    throw new Error(`Playwright chromium installation exited with status ${code}`);
  }
}

async function waitForHttpReady(url, serverProc, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let serverExited = null;
  serverProc.once('exit', (code) => {
    serverExited = code ?? 1;
  });

  while (Date.now() < deadline) {
    if (serverExited !== null) {
      throw new Error(`next start exited prematurely with code ${serverExited}`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_500) });
      if (res.ok) return;
    } catch {
      // Server still booting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for Next.js production server at ${url}`);
}

async function terminateServerProcess(serverProc) {
  if (!serverProc || serverProc.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (process.platform === 'win32' && serverProc.pid) {
        try {
          execFileSync('taskkill', ['/PID', String(serverProc.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          });
        } catch {
          // Process already exited
        }
      } else {
        try {
          serverProc.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }
      resolve();
    }, 2_000);

    serverProc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      serverProc.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

function readGitHead(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function isDirtyWorktree(root) {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', 'app', 'components', 'lib', 'proxy.ts', 'next.config.js'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out.length > 0;
  } catch {
    return true;
  }
}

export async function runBrowserSuite({ root, suiteId, suiteDef, rawPath, isolatedEnv }) {
  await ensurePlaywrightChromium(root, isolatedEnv);

  const services = await startLoopbackServices({
    supabasePort: 24391,
    r2Port: 24392,
    resendPort: 24393,
  });

  let serverProc = null;

  try {
    const appPort = await findFreeLoopbackPort(24390);
    const appOrigin = `http://127.0.0.1:${appPort}`;
    const appEnv = {
      ...isolatedEnv,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      ...services.envForApp(appOrigin),
    };

    const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
    const buildIdPath = path.join(root, '.next', 'BUILD_ID');
    const stampPath = path.join(root, '.next', '.loopback-build-stamp.json');
    const headCommit = readGitHead(root);
    const dirty = isDirtyWorktree(root);

    const expectedStamp = {
      headCommit,
      supabaseOrigin: services.supabaseOrigin,
      r2Origin: services.r2Origin,
      appOrigin,
      publishableKey: appEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    };

    let canReuseBuild = !dirty && fs.existsSync(buildIdPath) && fs.existsSync(stampPath);
    if (canReuseBuild) {
      try {
        const existingStamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
        canReuseBuild =
          existingStamp.headCommit === expectedStamp.headCommit &&
          existingStamp.supabaseOrigin === expectedStamp.supabaseOrigin &&
          existingStamp.r2Origin === expectedStamp.r2Origin &&
          existingStamp.appOrigin === expectedStamp.appOrigin &&
          existingStamp.publishableKey === expectedStamp.publishableKey;
      } catch {
        canReuseBuild = false;
      }
    }

    if (!canReuseBuild) {
      console.log(`[browser-harness:${suiteId}] Building production Next.js bundle against loopback fixtures...`);
      const buildExit = await spawnPromise(process.execPath, [nextBin, 'build'], {
        cwd: root,
        env: appEnv,
        stdio: 'inherit',
      });
      if (buildExit !== 0) {
        return buildExit;
      }
      if (!dirty) {
        fs.writeFileSync(stampPath, JSON.stringify(expectedStamp, null, 2));
      } else if (fs.existsSync(stampPath)) {
        fs.unlinkSync(stampPath);
      }
    } else {
      console.log(`[browser-harness:${suiteId}] Reusing verified loopback production build for ${headCommit.slice(0, 7)}.`);
    }

    serverProc = spawn(
      process.execPath,
      [nextBin, 'start', '-H', '127.0.0.1', '-p', String(appPort)],
      {
        cwd: root,
        env: appEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    serverProc.stdout?.on('data', (chunk) => {
      if (process.env.DEBUG_LOOPBACK_SERVER === '1') {
        process.stdout.write(chunk.toString('utf8'));
      }
    });

    serverProc.stderr?.on('data', (chunk) => {
      const msg = chunk.toString('utf8');
      if (process.env.DEBUG_LOOPBACK_SERVER === '1') {
        process.stderr.write(msg);
      }
    });

    await waitForHttpReady(`${appOrigin}/robots.txt`, serverProc);

    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    if (fs.existsSync(rawPath)) {
      fs.unlinkSync(rawPath);
    }

    const pwCli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
    const pwEnv = {
      ...appEnv,
      PLAYWRIGHT_BASE_URL: appOrigin,
      E2E_BASE_URL: appOrigin,
      PLAYWRIGHT_JSON_OUTPUT_NAME: rawPath,
      LOOPBACK_SUPABASE_URL: services.supabaseOrigin,
      LOOPBACK_R2_URL: services.r2Origin,
      LOOPBACK_RESEND_URL: services.resendOrigin,
    };

    const pwExit = await spawnPromise(
      process.execPath,
      [pwCli, 'test', suiteDef.directory, '--reporter=list,json'],
      {
        cwd: root,
        env: pwEnv,
        stdio: 'inherit',
      }
    );

    return pwExit;
  } finally {
    await terminateServerProcess(serverProc);
    await services.close();
  }
}
