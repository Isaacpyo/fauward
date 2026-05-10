import { PrismaClient } from '@prisma/client';
import { seedStaffRoles } from '../services/staff-iam.service.js';

const prisma = new PrismaClient();

try {
  await seedStaffRoles(prisma);
  console.log('Seeded staff IAM roles.');
} finally {
  await prisma.$disconnect();
}
