import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { scanUnencryptedSecrets } from '../services/crypto/encrypted-columns.js';

// Usage: npx tsx src/scripts/encryption-at-rest-scan.ts
// WP-5.3 (SOC 2 CC6.6): lists rows whose secret columns hold a value without the field-encryption `v1:` prefix (ids
// only, never values). Exit code 1 when any is found. CI runs the same check as ACC-ENC-1 on seeded data.
dotenv.config();

const prisma = new PrismaClient();

try {
  const result = await scanUnencryptedSecrets(prisma);
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
