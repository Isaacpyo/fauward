import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { backfillOnboardingSteps } from './onboarding-steps.js';

// Usage: npx tsx src/scripts/backfills/0059-onboarding-steps.ts [--dry-run]
// After migration 0059_onboarding_nudge (WP-2.17): onboarding steps re-derived from real data as timestamps; the old
// click-set flags are dropped. The production run needs owner approval; attach the dry-run output to the PR.
dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

try {
  console.log(JSON.stringify(await backfillOnboardingSteps(prisma, { dryRun })));
} finally {
  await prisma.$disconnect();
}
