import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { backfillLedgerKind } from './ledger-kind.js';

// Usage: npx tsx src/scripts/backfills/0045-ledger-kind.ts [--dry-run]
// After migration 0045_ledger_kind (spec label 0040): console-created billing rows become PLATFORM. The production run
// needs owner approval; attach the dry-run output to the PR.
dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

try {
  console.log(JSON.stringify(await backfillLedgerKind(prisma, { dryRun })));
} finally {
  await prisma.$disconnect();
}
