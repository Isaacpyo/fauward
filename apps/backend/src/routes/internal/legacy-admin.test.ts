import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// WP-1.6 gate: the legacy admin namespace and app are gone. Scans apps/** source (not node_modules or build output).

const APPS = resolve(process.cwd(), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', '.next', 'test-results', 'playwright-report', 'coverage', '.vercel']);
const SOURCE = /\.(ts|tsx|js|mjs|cjs|json|md|py|html|ya?ml|toml)$/;
const LEGACY = 'api/v1/' + 'admin';

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...(await sourceFiles(resolve(dir, entry.name))));
    } else if (SOURCE.test(entry.name)) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

const isTestFile = (path: string) => /(\.test\.|\.spec\.|[\\/]__tests__[\\/]|[\\/]e2e[\\/])/.test(path);

describe('legacy admin removed (WP-1.6)', () => {
  it('ACC-LEG-2 ACC-IMP-5 no file under apps/ references the legacy admin API except tests asserting 404', { timeout: 60_000 }, async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(APPS)) {
      const source = await readFile(file, 'utf8');
      if (!source.includes(LEGACY)) continue;
      if (isTestFile(file) && source.includes('404')) continue;
      offenders.push(relative(APPS, file).replaceAll('\\', '/'));
    }
    expect(offenders).toEqual([]);
  });

  it('ACC-LEG-2 no backend module registers a route under the legacy admin namespace', { timeout: 30_000 }, async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(resolve(process.cwd(), 'src'))) {
      if (isTestFile(file) || !file.endsWith('.ts')) continue;
      const source = await readFile(file, 'utf8');
      for (const match of source.matchAll(/app\.(get|post|put|patch|delete)\(\s*['`](\/api\/v1\/admin[^'`]*)/g)) offenders.push(`${relative(APPS, file)}: ${match[2]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('ACC-LEG-2 the legacy admin route module and the apps/admin workspace are deleted', () => {
    expect(existsSync(resolve(process.cwd(), 'src/modules/super-admin/super-admin.routes.ts'))).toBe(false);
    expect(existsSync(resolve(APPS, 'admin/package.json'))).toBe(false);
  });

  it('ACC-LEG-2 self-test: a non-test reference is reported, a 404 test is not', () => {
    expect(isTestFile('apps/backend/src/x.routes.ts')).toBe(false);
    expect(isTestFile('apps/backend/src/modules/tracking/__tests__/superadmin-audit.spec.ts')).toBe(true);
    expect(isTestFile('apps/super-admin/e2e/legacy-redirects.spec.ts')).toBe(true);
  });
});
