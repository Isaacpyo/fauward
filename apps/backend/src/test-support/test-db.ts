import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Real-Postgres tests (architecture §11): `describe.runIf(HAS_TEST_DB)`; CI sets TEST_DATABASE_URL (schema from
// `prisma db push`), locally it is the VM slot. The client has no tenant middleware: console routes run in system
// context and scope by tenantId explicitly, which is what these tests check. Fixtures use unique slugs so runs never
// collide on a shared slot database.

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const HAS_TEST_DB = Boolean(TEST_DATABASE_URL);

/** Locally the slot database is reached through an SSH tunnel, so allow slow connects under load. */
function withConnectTimeout(url: string | undefined) {
  if (!url || /[?&]connect_timeout=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connect_timeout=30&pool_timeout=30`;
}

export function createTestPrisma() {
  return new PrismaClient({
    datasources: { db: { url: withConnectTimeout(TEST_DATABASE_URL) } },
    // Interactive transactions default to 5 s, which a round trip per query through the tunnel can exceed.
    transactionOptions: { maxWait: 15_000, timeout: 30_000 }
  });
}

export function uniqueSuffix() {
  return randomUUID().slice(0, 8);
}

export async function createTestTenant(prisma: PrismaClient, data: { name?: string; plan?: 'STARTER' | 'PRO' | 'ENTERPRISE'; status?: 'TRIALING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'DEMO' } = {}) {
  const suffix = uniqueSuffix();
  return prisma.tenant.create({
    data: { name: data.name ?? `Test Tenant ${suffix}`, slug: `t-${suffix}`, plan: data.plan ?? 'STARTER', status: data.status ?? 'ACTIVE' }
  });
}

export async function createTestPlatformUser(prisma: PrismaClient, data: { name?: string } = {}) {
  const suffix = uniqueSuffix();
  return prisma.platformUser.create({ data: { email: `staff-${suffix}@fauward.test`, name: data.name ?? `Staff ${suffix}`, passwordHash: 'not-a-real-hash', role: 'PLATFORM_OPERATIONS', mfaEnabled: true } });
}

/** A Redis stand-in for routes that publish activity and invalidate caches. */
export function inertRedis() {
  return {
    publish: async () => 0,
    del: async () => 0,
    get: async () => null,
    set: async () => 'OK',
    incr: async () => 1,
    expire: async () => 1
  };
}
