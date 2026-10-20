import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { encryptTotpSecrets } from './encrypt-totp-secrets.js';

// Usage: npx tsx src/scripts/backfills/0037-encrypt-totp-secrets.ts [--dry-run]
dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

try {
  const result = await encryptTotpSecrets(prisma, { dryRun });
  console.log(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
