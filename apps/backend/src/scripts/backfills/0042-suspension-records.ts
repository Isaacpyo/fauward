import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { backfillSuspensionRecords } from './suspension-records.js';

// Usage: npx tsx src/scripts/backfills/0042-suspension-records.ts [--dry-run]
// After migration 0042_suspension_unification (spec label 0039): one SuspensionRecord per suspended tenant without one.
dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

try {
  console.log(JSON.stringify(await backfillSuspensionRecords(prisma, { dryRun })));
} finally {
  await prisma.$disconnect();
}
// The service import opens queue connections to Redis that this script never closes; exit instead of waiting on them.
process.exit(0);
