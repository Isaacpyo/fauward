import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { seedStaffRoles } from '../../services/staff-iam.service.js';
import { backfillLegacyRoleAssignments } from './legacy-role-assignments.js';

// Usage: npx tsx src/scripts/backfills/0039a-legacy-role-assignments.ts [--dry-run]
// One-time (WP-1.1, D2): StaffUser + StaffRoleAssignment (grantedBy 'legacy-backfill') from PlatformUser.role.
dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

try {
  // Staff roles must exist before assignments reference them.
  if (!dryRun) await seedStaffRoles(prisma);
  const result = await backfillLegacyRoleAssignments(prisma, { dryRun });
  console.log(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
