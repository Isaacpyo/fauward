import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = process.cwd();
const lockDir = join(repoRoot, 'node_modules', '.cache', 'fauward-next-build.lock');
const lockTimeoutMs = 10 * 60 * 1000;
const staleLockMs = 30 * 60 * 1000;

async function acquireLock() {
  const startedAt = Date.now();

  while (true) {
    try {
      mkdirSync(dirname(lockDir), { recursive: true });
      mkdirSync(lockDir);
      writeFileSync(join(lockDir, 'owner'), `${process.pid} ${workspaceRoot}\n`);
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;

      let stale = false;
      try {
        stale = Date.now() - statSync(lockDir).mtimeMs > staleLockMs;
      } catch {
        stale = true;
      }

      if (stale) {
        try {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        } catch {
          // Another build may have released it between stat and remove.
        }
      }

      if (Date.now() - startedAt > lockTimeoutMs) {
        throw new Error(`Timed out waiting for Next.js build lock at ${lockDir}`);
      }

      await delay(250);
    }
  }
}

function removeTraceFile() {
  for (const distDir of ['.next', '.next-build']) {
    try {
      rmSync(join(workspaceRoot, distDir, 'trace'), { force: true });
    } catch {
      // A locked trace file is transient on Windows; the retry below handles it.
    }
  }
}

function runNextBuild() {
  process.env.NODE_ENV = 'production';
  process.env.NEXT_TELEMETRY_DISABLED = '1';

  const requireFromWorkspace = createRequire(pathToFileURL(join(workspaceRoot, 'package.json')));
  const nextBin = requireFromWorkspace.resolve('next/dist/bin/next');
  return spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: workspaceRoot,
    env: process.env,
    shell: false,
    stdio: 'inherit'
  });
}

await acquireLock();

let result;
try {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    removeTraceFile();
    result = runNextBuild();
    if (result.status === 0) break;
    if (attempt === 1) await delay(1000);
  }
} finally {
  rmSync(lockDir, { recursive: true, force: true });
}

if (result?.error) {
  console.error(result.error);
}

process.exit(result?.status ?? 1);
