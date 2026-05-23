import { PrismaClient, UserRole } from '@prisma/client';
import dotenv from 'dotenv';
import { hashPassword } from '../shared/utils/hash.js';

dotenv.config();

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const email = argValue('email')?.toLowerCase().trim();
const password = argValue('password');
const tenantArg = argValue('tenant');
const roleArg = argValue('role') ?? 'TENANT_ADMIN';
const firstName = argValue('firstName')?.trim() || undefined;
const lastName = argValue('lastName')?.trim() || undefined;
const phone = argValue('phone')?.trim() || undefined;
const resetIfExists = process.argv.includes('--reset-if-exists');

if (!email || !password) {
  throw new Error('Usage: tsx src/scripts/tenant-user-create.ts --email <email> --password <password> [--tenant <slug>] [--role TENANT_ADMIN]');
}

if (password.length < 8) {
  throw new Error('Password must be at least 8 characters.');
}

if (!Object.values(UserRole).includes(roleArg as UserRole)) {
  throw new Error(`Invalid role: ${roleArg}. Allowed: ${Object.values(UserRole).join(', ')}`);
}

const role = roleArg as UserRole;
const prisma = new PrismaClient();

async function main() {
  const tenant = tenantArg
    ? await prisma.tenant.findUnique({ where: { slug: tenantArg.toLowerCase() } })
    : await prisma.tenant.findFirst({ orderBy: { createdAt: 'desc' } });

  if (!tenant) {
    throw new Error(
      tenantArg
        ? `Tenant with slug "${tenantArg}" not found.`
        : 'No tenant found in the database. Register one first via POST /api/v1/auth/register.'
    );
  }

  const passwordHash = await hashPassword(password!);
  const existing = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: email! } });

  if (existing) {
    if (!resetIfExists) {
      throw new Error(
        `User ${email} already exists in tenant "${tenant.slug}". Re-run with --reset-if-exists to overwrite the password.`
      );
    }
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, role, isActive: true, firstName, lastName, phone }
    });
    console.log(`Updated user ${updated.email} (${updated.id}) in tenant ${tenant.slug} with role ${updated.role}.`);
    return;
  }

  const created = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: email!,
      passwordHash,
      role,
      firstName,
      lastName,
      phone,
      isActive: true
    }
  });
  console.log(`Created user ${created.email} (${created.id}) in tenant ${tenant.slug} with role ${created.role}.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
