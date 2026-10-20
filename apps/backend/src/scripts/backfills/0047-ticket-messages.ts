import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { backfillTicketMessages } from './ticket-messages.js';

// Usage: npx tsx src/scripts/backfills/0047-ticket-messages.ts [--dry-run]
// After migration 0047_support_audience (spec label 0045): message author types/visibility and ticket audiences (D5).
// The production run needs owner approval; attach the dry-run output to the PR.
dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

try {
  console.log(JSON.stringify(await backfillTicketMessages(prisma, { dryRun })));
} finally {
  await prisma.$disconnect();
}
