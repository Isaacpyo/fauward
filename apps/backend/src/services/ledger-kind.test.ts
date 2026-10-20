import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// D4 gate: every Prisma call on Invoice, Payment, Refund or CreditNote names `kind` (PLATFORM = Fauward billing a
// tenant, TENANT_CUSTOMER = a tenant billing its customers), so the two ledgers never mix.

const LEDGER_CALL = /\.(invoice|payment|refund|creditNote)\.(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|aggregate|groupBy|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;

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

export function findUnnamedLedgerCalls(source: string) {
  const offenders: string[] = [];
  for (const match of source.matchAll(LEDGER_CALL)) {
    const args = callArguments(source, (match.index ?? 0) + match[0].length - 1);
    if (!/\bkind\b/.test(args)) {
      const line = source.slice(0, match.index).split('\n').length;
      offenders.push(`line ${line}: .${match[1]}.${match[2]}()`);
    }
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

describe('ledger kind on every billing query (D4)', () => {
  it('every Prisma call on Invoice/Payment/Refund/CreditNote names kind', { timeout: 30_000 }, async () => {
    const root = resolve(process.cwd(), 'src');
    const offenders: string[] = [];
    for (const file of await sourceFiles(root)) {
      const path = relative(root, file).replaceAll('\\', '/');
      for (const finding of findUnnamedLedgerCalls(await readFile(file, 'utf8'))) offenders.push(`${path} ${finding}`);
    }
    expect(offenders).toEqual([]);
  });

  it('self-test: a query without kind is caught, one with kind passes', () => {
    expect(findUnnamedLedgerCalls(`await app.prisma.invoice.findMany({ where: { tenantId } });`)).toEqual(['line 1: .invoice.findMany()']);
    expect(findUnnamedLedgerCalls(`await tx.payment.update({\n  where: { id, kind: 'PLATFORM' },\n  data: { status: 'COMPLETED' }\n});`)).toEqual([]);
    expect(findUnnamedLedgerCalls(`await prisma.creditNote.create({ data: { tenantId, amount } });`)).toHaveLength(1);
  });
});
