import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// D3 gate: only services/tenant-suspension.service.ts may suspend a tenant or lift a suspension. Any other
// `tenant.update/updateMany/upsert/create` whose arguments set status SUSPENDED, or clear suspendedAt/suspensionReason,
// fails the build.

const ALLOWED = new Set(['services/tenant-suspension.service.ts']);
const TENANT_WRITE = /\.tenant\.(update|updateMany|upsert|create)\s*\(/g;
const SUSPEND = /status\s*:\s*(['"`]SUSPENDED['"`]|TenantStatus\.SUSPENDED)/;
const LIFT = /(suspendedAt|suspensionReason)\s*:\s*null/;

/** Text of the call's argument list, from the opening paren to its matching close. */
function callArguments(source: string, openIndex: number) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  return source.slice(openIndex + 1);
}

export function findSuspensionWrites(source: string) {
  const offenders: string[] = [];
  for (const match of source.matchAll(TENANT_WRITE)) {
    const args = callArguments(source, (match.index ?? 0) + match[0].length - 1);
    if (SUSPEND.test(args)) offenders.push(`${match[0]} sets status SUSPENDED`);
    if (LIFT.test(args)) offenders.push(`${match[0]} clears the suspension fields`);
  }
  return offenders;
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
    })
  );
  return nested.flat();
}

describe('single suspension path (D3)', () => {
  it('ACC-SUS-5 no file outside the suspension service writes or lifts a tenant suspension', { timeout: 30_000 }, async () => {
    const root = resolve(process.cwd(), 'src');
    const offenders: string[] = [];
    for (const file of await sourceFiles(root)) {
      const path = relative(root, file).replaceAll('\\', '/');
      if (ALLOWED.has(path)) continue;
      for (const finding of findSuspensionWrites(await readFile(file, 'utf8'))) offenders.push(`${path}: ${finding}`);
    }
    expect(offenders).toEqual([]);
  });

  it('ACC-SUS-5 self-test: a direct status write and a direct lift are caught', () => {
    const direct = `await app.prisma.tenant.update({ where: { id }, data: { status: 'SUSPENDED', suspendedAt: new Date() } });`;
    expect(findSuspensionWrites(direct)).toEqual(['.tenant.update( sets status SUSPENDED']);
    const multiLine = `await tx.tenant.updateMany({\n  where: { id: { in: ids } },\n  data: {\n    status: TenantStatus.SUSPENDED\n  }\n});`;
    expect(findSuspensionWrites(multiLine)).toHaveLength(1);
    const lift = `await prisma.tenant.update({ where: { id }, data: { status: 'ACTIVE', suspensionReason: null, suspendedAt: null } });`;
    expect(findSuspensionWrites(lift)).toEqual(['.tenant.update( clears the suspension fields']);
  });

  it('reads and unrelated tenant writes are not flagged', () => {
    expect(findSuspensionWrites(`if (tenant.status === 'SUSPENDED') return;`)).toEqual([]);
    expect(findSuspensionWrites(`await app.prisma.tenant.update({ where: { id }, data: { region: 'europe' } });`)).toEqual([]);
    expect(findSuspensionWrites(`await prisma.staffUser.update({ where: { id }, data: { status: 'SUSPENDED' } });`)).toEqual([]);
  });
});
