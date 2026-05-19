import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../shared/utils/hash.js';

const prisma = new PrismaClient();

const email = process.env.PLATFORM_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const password = process.env.PLATFORM_BOOTSTRAP_PASSWORD;
const name = process.env.PLATFORM_BOOTSTRAP_NAME?.trim() || 'Platform Admin';

if (!email || !password) {
  throw new Error('PLATFORM_BOOTSTRAP_EMAIL and PLATFORM_BOOTSTRAP_PASSWORD are required.');
}

try {
  const passwordHash = await hashPassword(password);

  const user = await prisma.platformUser.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE'
    },
    update: {
      passwordHash,
      name,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE'
    }
  });

  console.log(`Platform user created/updated: ${user.email} (${user.role})`);
} finally {
  await prisma.$disconnect();
}
