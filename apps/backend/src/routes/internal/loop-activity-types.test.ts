import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Phase 2 exit criterion, extended to L2 and L20 in Phase 4 (WP-4.R): every PlatformActivity type that
// 21-tenant-loop-map.md lists for L1–L20 is emitted by backend code — it appears as a string literal in a non-test file.

const LOOP_MAP = resolve(process.cwd(), '../../docs/console-spec/21-tenant-loop-map.md');
const DEFERRED_LOOPS = new Set<number>();

async function loopActivityTypes() {
  const markdown = await readFile(LOOP_MAP, 'utf8');
  const types: Array<{ loop: number; type: string }> = [];
  for (const section of markdown.split(/^### /m).slice(1)) {
    const loop = /^L(\d+) /.exec(section);
    if (!loop || DEFERRED_LOOPS.has(Number(loop[1])) || Number(loop[1]) > 20) continue;
    const activity = /\*\*Activity:\*\*([^\n]*)/.exec(section);
    if (!activity) continue;
    for (const match of activity[1].matchAll(/`([a-z_]+\.[a-z_.]+)`/g)) types.push({ loop: Number(loop[1]), type: match[1] });
  }
  return types;
}

async function sourceText(dir: string): Promise<string> {
  const parts: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) parts.push(await sourceText(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) parts.push(await readFile(full, 'utf8'));
  }
  return parts.join('\n');
}

describe('tenant loop activity coverage (Phase 2 exit, L2/L20 since Phase 4)', () => {
  it('every L1–L20 activity type in the loop map is emitted by backend code', { timeout: 30_000 }, async () => {
    const types = await loopActivityTypes();
    expect(types.length).toBeGreaterThan(50);
    const source = await sourceText(resolve(process.cwd(), 'src'));
    const missing = types.filter(({ type }) => !source.includes(`'${type}'`) && !source.includes(`"${type}"`) && !source.includes(`\`${type}`)).map(({ loop, type }) => `L${loop} ${type}`);
    expect(missing).toEqual([]);
  });
});
