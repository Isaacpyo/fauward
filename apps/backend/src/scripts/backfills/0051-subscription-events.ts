import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { backfillSubscriptionEvents } from './subscription-events.js';

// Usage: npx tsx src/scripts/backfills/0051-subscription-events.ts [--dry-run]
// After migration 0051_plan_change (spec label 0047): CREATED/CANCELLED history for existing subscriptions.
// The production run needs owner approval; attach the dry-run output to the PR.
dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

try {
  console.log(JSON.stringify(await backfillSubscriptionEvents(prisma, { dryRun })));
} finally {
  await prisma.$disconnect();
}
