import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { backfillTenantPaymentGateways } from './tenant-payment-gateways.js';

// Usage: npx tsx src/scripts/backfills/0055-tenant-payment-gateways.ts [--dry-run] [--clear-legacy]
// After migration 0055_tenant_payment_gateways (WP-2.12, S12): plaintext gateway keys in TenantSettings become
// encrypted TenantPaymentGateway rows; TenantSettings.webhookSecret is encrypted in place. Needs FIELD_ENCRYPTION_KEYS.
// The production run needs owner approval; attach the dry-run output to the PR.
dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const clearLegacy = process.argv.includes('--clear-legacy');
const prisma = new PrismaClient();

try {
  console.log(JSON.stringify(await backfillTenantPaymentGateways(prisma, { dryRun, clearLegacy })));
} finally {
  await prisma.$disconnect();
}
// The service import opens queue connections to Redis that this script never closes; exit instead of waiting on them.
process.exit(0);
