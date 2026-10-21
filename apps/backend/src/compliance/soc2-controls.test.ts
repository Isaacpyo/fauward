import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// WP-5.6 (P1-7): scripts/soc2/controls.json is what the soc2-evidence CI job checks. Keep it honest in the normal test
// run: every file it names exists, and every test it names appears in a test title of those files.

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
type Registry = { controls: Array<{ id: string; tests: string[] }>; backendFiles: string[]; e2eSpecs: string[] };
const registry = JSON.parse(readFileSync(join(root, 'scripts/soc2/controls.json'), 'utf8')) as Registry;
const backendFiles = registry.backendFiles.map((file) => join(root, 'apps/backend', file));
const e2eFiles = registry.e2eSpecs.map((spec) => join(root, 'apps/super-admin/e2e', `${spec}.spec.ts`));

describe('SOC 2 control registry (WP-5.6)', () => {
  it('names only files that exist', () => {
    expect([...backendFiles, ...e2eFiles].filter((file) => !existsSync(file))).toEqual([]);
  });

  it('every control test is a test in the files the evidence job runs', () => {
    const sources = [...backendFiles, ...e2eFiles].filter(existsSync).map((file) => ({ file, text: readFileSync(file, 'utf8') }));
    const missing = registry.controls.flatMap((control) =>
      control.tests
        .filter((entry) => {
          if (entry.startsWith('file:')) return !sources.some((source) => source.file.endsWith(entry.slice(5)));
          const pattern = entry.startsWith('ACC-') ? new RegExp(`['"\`][^'"\`]*${entry}(?![0-9])`) : new RegExp(entry);
          return !sources.some((source) => pattern.test(source.text));
        })
        .map((entry) => `${control.id}: ${entry}`)
    );
    expect(missing).toEqual([]);
  });
});
