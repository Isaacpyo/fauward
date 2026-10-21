import { PrismaClient } from '@prisma/client';
import { verifyPlatformAuditChain } from '../src/services/platform-audit.service.js';

const prisma = new PrismaClient();

async function main() {
  const result = await verifyPlatformAuditChain(prisma);

  if (result.ok) {
    console.log(`Chain valid across ${result.checked} entries (${result.legacy} pre-0080 entries up to the cut-over)`);
    return;
  }

  console.error(`Chain broken at seq ${result.firstBrokenSeq} (${result.reason}, entry ${result.firstBrokenId})`);
  process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
