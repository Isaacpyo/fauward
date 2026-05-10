import { PrismaClient, PlatformRole } from '@prisma/client';
import dotenv from 'dotenv';
import { hashPassword } from '../shared/utils/hash.js';

dotenv.config();

function argValue(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const email = (argValue('email') ?? process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAIL)?.toLowerCase().trim();
const password = argValue('password') ?? process.env.PLATFORM_ADMIN_BOOTSTRAP_PASSWORD;
const name = argValue('name') ?? process.env.PLATFORM_ADMIN_BOOTSTRAP_NAME ?? null;
const role = (argValue('role') ?? process.env.PLATFORM_ADMIN_BOOTSTRAP_ROLE ?? 'SUPER_ADMIN') as PlatformRole;

if (!email || !password) {
  throw new Error('PLATFORM_ADMIN_BOOTSTRAP_EMAIL and PLATFORM_ADMIN_BOOTSTRAP_PASSWORD, or --email and --password, are required.');
}

if (password.length < 12) {
  throw new Error('Bootstrap password must be at least 12 characters.');
}

if (!Object.values(PlatformRole).includes(role)) {
  throw new Error(`Invalid platform role: ${role}`);
}

const prisma = new PrismaClient();

try {
  const existing = await prisma.platformUser.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`A platform user with email ${email} already exists.`);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.platformUser.create({
    data: {
      email,
      name,
      role,
      passwordHash,
      status: 'ACTIVE'
    },
    select: { id: true, email: true, role: true }
  });

  console.log(`Created platform user ${user.email} (${user.role}) with id ${user.id}.`);
} finally {
  await prisma.$disconnect();
}
