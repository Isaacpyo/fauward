import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { checkEncryptedValuesDecrypt, rotateFieldEncryption } from '../services/crypto/encrypted-columns.js';

// Usage: npx tsx src/scripts/rotate-field-encryption-key.ts [--dry-run] [--tenant <id>]... [--platform-user <id>]...
// WP-5.3 (SOC 2 CC6.6). Rotation: add the new key to FIELD_ENCRYPTION_KEYS (keep the old one), set
// FIELD_ENCRYPTION_ACTIVE_KEY_ID to it and deploy; run this script (dry run first) until `rotated` is 0 and `failures` is
// empty; only then remove the old key. Re-encrypts every encrypted column under the active key; values are never printed.
// The production run needs owner approval.
dotenv.config();

function values(flag: string) {
  const out: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === flag && process.argv[index + 1]) out.push(process.argv[index + 1]);
  });
  return out.length > 0 ? out : undefined;
}

const dryRun = process.argv.includes('--dry-run');
const scope = { tenantIds: values('--tenant'), platformUserIds: values('--platform-user') };
const prisma = new PrismaClient();

try {
  const rotation = await rotateFieldEncryption(prisma, { dryRun, scope });
  const check = await checkEncryptedValuesDecrypt(prisma, { scope });
  console.log(JSON.stringify({ rotation, keyIdsInUse: check.keyIds, undecryptable: check.failures }));
  if (rotation.failures.length > 0 || check.failures.length > 0) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
