import Fastify, { type FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';
import { SECRET_REGISTRY } from '../../../config/secret-registry.js';

// trust.secrets (WP-4.12) against real Postgres: the inventory reflects env presence, rotations are detected by
// fingerprint, the expiring list is right, writes need trust.secrets.write — and no response or log line ever
// contains a secret value.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'secrets@fauward.test', name: 'Secret Keeper', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_secrets', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));

const DAY = 86_400_000;

describe.runIf(HAS_TEST_DB)('trust.secrets (WP-4.12, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  const logLines: string[] = [];

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['trust.secrets.read', 'trust.secrets.write'];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logLines.push(String(chunk));
        callback();
      }
    });
    app = Fastify({ logger: { level: 'trace', stream } });
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleSecretRoutes } = await import('./secrets.routes.js');
    await registerConsoleSecretRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function inventory(env: Record<string, string>, now?: Date) {
    const { runSecretInventory } = await import('../../../services/secret-inventory.service.js');
    return runSecretInventory(app, env, now);
  }

  async function row(envName: string) {
    return prisma.secretCredential.findUniqueOrThrow({ where: { envName } });
  }

  it('ACC-SECR-1 the inventory matches env presence, one row per registry entry', async () => {
    const result = await inventory({ JWT_ACCESS_SECRET: `access-${uniqueSuffix()}` });
    expect(result).toMatchObject({ registry: SECRET_REGISTRY.length, configured: 1, doppler: 'NOT_CONFIGURED' });
    expect(await row('JWT_ACCESS_SECRET')).toMatchObject({ configured: true, source: 'ENV', rotateEveryDays: 180 });
    expect((await row('JWT_ACCESS_SECRET')).fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(await row('STRIPE_SECRET_KEY')).toMatchObject({ configured: false });

    const list = (await app.inject({ method: 'GET', url: '/api/internal/secrets' })).json();
    const byEnv = new Map(list.data.map((item: { envName: string }) => [item.envName, item]));
    for (const definition of SECRET_REGISTRY) expect(byEnv.has(definition.envName), definition.envName).toBe(true);
    expect(byEnv.get('JWT_ACCESS_SECRET')).toMatchObject({ configured: true, ownerTeam: 'Platform', status: 'OK', inRegistry: true });
    expect(byEnv.get('STRIPE_SECRET_KEY')).toMatchObject({ configured: false, status: 'NOT_CONFIGURED', integration: 'stripe' });
    expect(list.doppler).toMatchObject({ configured: false });
  });

  it('ACC-SECR-3 a fingerprint change sets lastRotatedAt and writes a secret.rotated activity', async () => {
    await inventory({ AGENT_SERVICE_TOKEN: `agent-a-${uniqueSuffix()}` });
    const before = await row('AGENT_SERVICE_TOKEN');
    const second = await inventory({ AGENT_SERVICE_TOKEN: `agent-b-${uniqueSuffix()}` });
    expect(second.rotated).toBeGreaterThanOrEqual(1);
    const after = await row('AGENT_SERVICE_TOKEN');
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.lastRotatedAt).not.toBeNull();
    expect(after.lastRotatedAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const activity = await prisma.platformActivity.findFirst({ where: { subjectId: after.id, type: 'secret.rotated' }, orderBy: { occurredAt: 'desc' } });
    expect(activity).toMatchObject({ service: 'trust.secrets', actorType: 'SYSTEM' });
    expect(await prisma.platformAuditLog.count({ where: { action: 'SECRET_ROTATION_DETECTED', metadata: { path: ['secretId'], equals: after.id } } })).toBeGreaterThanOrEqual(1);
  });

  it('ACC-SECR-4 the expiring list holds secrets due within 14 days or overdue; overdue ones notify the owner once a day', async () => {
    const suffix = uniqueSuffix().toUpperCase();
    const owner = await createTestPlatformUser(prisma);
    const now = Date.now();
    const make = (key: string, rotatedDaysAgo: number, policy: number) =>
      prisma.secretCredential.create({ data: { name: `Test ${key}`, envName: `TEST_${key}_${suffix}`, source: 'MANUAL', configured: true, firstSeenAt: new Date(now - 400 * DAY), lastRotatedAt: new Date(now - rotatedDaysAgo * DAY), rotateEveryDays: policy, ownerId: owner.id } });
    const overdue = await make('OVERDUE', 40, 30);
    const dueSoon = await make('DUESOON', 80, 90);
    const fine = await make('FINE', 10, 90);
    const noPolicy = await prisma.secretCredential.create({ data: { name: 'Test NOPOLICY', envName: `TEST_NOPOLICY_${suffix}`, source: 'MANUAL', configured: true, firstSeenAt: new Date(now - 400 * DAY) } });

    const expiring = (await app.inject({ method: 'GET', url: '/api/internal/secrets/expiring' })).json();
    const ids = expiring.data.map((item: { id: string }) => item.id);
    expect(ids).toContain(overdue.id);
    expect(ids).toContain(dueSoon.id);
    expect(ids).not.toContain(fine.id);
    expect(ids).not.toContain(noPolicy.id);
    expect(expiring.data.find((item: { id: string }) => item.id === overdue.id)).toMatchObject({ status: 'OVERDUE' });
    expect(expiring.data.find((item: { id: string }) => item.id === dueSoon.id)).toMatchObject({ status: 'DUE_SOON' });
    expect(ids.indexOf(overdue.id)).toBeLessThan(ids.indexOf(dueSoon.id));

    await inventory({});
    await inventory({});
    expect(await prisma.staffNotification.count({ where: { platformUserId: owner.id, event: 'secret.rotation_overdue', link: `/trust/secrets/${overdue.id}` } })).toBe(1);
    expect(await prisma.platformActivity.count({ where: { subjectId: overdue.id, type: 'secret.rotation_overdue' } })).toBe(1);
    expect(await prisma.staffNotification.count({ where: { platformUserId: owner.id, link: `/trust/secrets/${dueSoon.id}` } })).toBe(0);
  });

  it('ACC-SECR-5 PATCH needs trust.secrets.write; with it the owner and policy change and are audited; mark-rotated is dangerous', async () => {
    await inventory({});
    const target = await row('GITHUB_TOKEN');
    permissions.current = ['trust.secrets.read'];
    const forbidden = await app.inject({ method: 'PATCH', url: `/api/internal/secrets/${target.id}`, payload: { rotateEveryDays: 30 } });
    expect(forbidden.statusCode).toBe(403);
    permissions.current = ['trust.secrets.read', 'trust.secrets.write'];

    const patched = await app.inject({ method: 'PATCH', url: `/api/internal/secrets/${target.id}`, payload: { rotateEveryDays: 30, ownerId: permissions.userId, rotationNotes: 'Rotate with the GitHub app' } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ rotateEveryDays: 30, owner: { id: permissions.userId }, rotationNotes: 'Rotate with the GitHub app' });

    const noReason = await app.inject({ method: 'POST', url: `/api/internal/secrets/${target.id}/mark-rotated`, payload: {} });
    expect(noReason.json()).toMatchObject({ error: 'REASON_REQUIRED' });
    const rotated = await app.inject({ method: 'POST', url: `/api/internal/secrets/${target.id}/mark-rotated`, payload: { reason: 'Rotated in GitHub settings' } });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().lastRotatedAt).not.toBeNull();

    const audit = (await app.inject({ method: 'GET', url: `/api/internal/secrets/${target.id}/audit` })).json();
    expect(audit.data.map((item: { action: string }) => item.action).slice(0, 2)).toEqual(['SECRET_MARKED_ROTATED', 'SECRET_POLICY_UPDATED']);
    expect(audit.data[0].reason).toBe('Rotated in GitHub settings');
    expect(await prisma.platformActivity.count({ where: { subjectId: target.id, type: { in: ['secret.policy_updated', 'secret.rotated'] }, actorId: permissions.userId } })).toBeGreaterThanOrEqual(2);
  });

  it('ACC-SECR-2 no API response or log line contains a secret value', async () => {
    const seeded = Object.fromEntries(SECRET_REGISTRY.map((definition) => [definition.envName, `value-${definition.envName}-${uniqueSuffix()}-do-not-leak`]));
    const jobResult = await inventory(seeded);
    const bodies: string[] = [JSON.stringify(jobResult)];
    const list = await app.inject({ method: 'GET', url: '/api/internal/secrets' });
    bodies.push(list.body, (await app.inject({ method: 'GET', url: '/api/internal/secrets/expiring' })).body);
    for (const item of list.json().data.slice(0, 5) as Array<{ id: string }>) {
      bodies.push((await app.inject({ method: 'GET', url: `/api/internal/secrets/${item.id}` })).body);
      bodies.push((await app.inject({ method: 'GET', url: `/api/internal/secrets/${item.id}/audit` })).body);
    }
    const first = list.json().data.find((item: { envName: string }) => item.envName === 'JWT_ACCESS_SECRET');
    bodies.push((await app.inject({ method: 'PATCH', url: `/api/internal/secrets/${first.id}`, payload: { rotationNotes: 'Rotate with the next release' } })).body);
    bodies.push((await app.inject({ method: 'POST', url: `/api/internal/secrets/${first.id}/mark-rotated`, payload: { reason: 'Rotated during the release' } })).body);
    const audits = await prisma.platformAuditLog.findMany({ where: { action: { startsWith: 'SECRET_' } }, orderBy: { createdAt: 'desc' }, take: 200 });
    const activities = await prisma.platformActivity.findMany({ where: { service: 'trust.secrets' }, orderBy: { occurredAt: 'desc' }, take: 200 });
    const haystack = [...bodies, ...logLines, JSON.stringify(audits), JSON.stringify(activities)].join('\n');
    expect(logLines.length).toBeGreaterThan(0);
    for (const value of Object.values(seeded)) expect(haystack.includes(value), 'a secret value leaked').toBe(false);
  });
});
