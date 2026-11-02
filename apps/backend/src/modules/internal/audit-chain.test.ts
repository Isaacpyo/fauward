import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { Prisma, PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../test-support/test-db.js';

// trust.audit (WP-5.1, S14) against real Postgres: one hash scheme, an advisory-locked writer (no forks under
// concurrency), tamper detection at the exact seq, exactly one audit row per console mutation, and the nightly job.

const session = vi.hoisted(() => ({ userId: 'unset', permissions: [] as Permission[] }));

vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: session.userId, email: 'auditor@fauward.test', name: 'Audit Tester', role: 'TRUST_ANALYST', status: 'ACTIVE', mfaEnabled: true },
      session: { id: `ps_audit_${session.userId}`, mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: session.userId }
    };
  }
}));
vi.mock('../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../services/staff-iam.service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(session.permissions), jit: new Map(), permissions: session.permissions }))
}));
vi.mock('../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));

describe.runIf(HAS_TEST_DB)('trust.audit chain (WP-5.1, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let auditReaderId: string;

  async function staffWith(permission: Permission, name: string) {
    const user = await createTestPlatformUser(prisma, { name });
    const role = await prisma.staffRole.create({ data: { id: `test-audit-${uniqueSuffix()}`, name: `${name} role`, description: 'test', permissions: [permission] } });
    const staff = await prisma.staffUser.create({ data: { platformUserId: user.id, email: user.email, name } });
    await prisma.staffRoleAssignment.create({ data: { staffId: staff.id, roleId: role.id } });
    return user.id;
  }

  async function verify() {
    const { verifyPlatformAuditChain } = await import('../../services/platform-audit.service.js');
    return verifyPlatformAuditChain(prisma, { batchSize: 250 });
  }

  /** Changes one row's metadata behind the writer's back, runs `work`, then puts the original value back. */
  async function tampered<T>(id: string, work: () => Promise<T>) {
    const original = await prisma.platformAuditLog.findUniqueOrThrow({ where: { id }, select: { metadata: true } });
    await prisma.platformAuditLog.update({ where: { id }, data: { metadata: { tampered: true } } });
    try {
      return await work();
    } finally {
      await prisma.platformAuditLog.update({ where: { id }, data: { metadata: original.metadata as Prisma.InputJsonValue } });
    }
  }

  async function rowsFor(actorId: string) {
    return prisma.platformAuditLog.count({ where: { actorId } });
  }

  /** The safety net writes after the response has finished; wait until the count settles. */
  async function settledRows(actorId: string, atLeast: number) {
    const deadline = Date.now() + 5_000;
    let count = await rowsFor(actorId);
    while (count < atLeast && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      count = await rowsFor(actorId);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    return rowsFor(actorId);
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    auditReaderId = await staffWith('trust.audit.read', 'Avery Auditor');
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { requestActorStorage } = await import('../../context/request-actor.context.js');
    const { consoleAuditSafetyNet } = await import('../../middleware/console-audit-safety-net.js');
    // The same two hooks app.ts installs: a per-request actor holder, then the audit safety net.
    app.addHook('onRequest', (_request, _reply, done) => requestActorStorage.run({}, done));
    app.addHook('preHandler', consoleAuditSafetyNet(app));
    const { registerInternalAuditRoutes } = await import('./audit.routes.js');
    const { registerConsoleIncidentRoutes } = await import('./platform/incidents.routes.js');
    const { registerConsoleComplianceRoutes } = await import('./trust/compliance.routes.js');
    await registerInternalAuditRoutes(app);
    await registerConsoleIncidentRoutes(app);
    await registerConsoleComplianceRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-AUD-5 100 concurrent audit writes produce 100 rows with a contiguous valid chain', async () => {
    const { writePlatformAuditLog } = await import('../../services/platform-audit.service.js');
    const action = `test.audit.concurrent.${uniqueSuffix()}`;
    await Promise.all(
      Array.from({ length: 100 }, (_unused, index) =>
        writePlatformAuditLog(prisma, { actorType: 'SYSTEM', actorId: 'acc-aud-5', action, metadata: { index, nested: { b: index, a: [1, 2] } } })
      )
    );
    const rows = await prisma.platformAuditLog.findMany({ where: { action }, orderBy: { seq: 'asc' }, select: { seq: true, previousHash: true, hash: true, hashVersion: true } });
    expect(rows).toHaveLength(100);
    expect(rows.every((row) => row.hashVersion === 2)).toBe(true);
    // No fork: no two v2 rows anywhere in the table point at the same previous hash.
    const forks = await prisma.platformAuditLog.groupBy({ by: ['previousHash'], where: { hashVersion: 2 }, _count: { id: true }, having: { id: { _count: { gt: 1 } } } });
    expect(forks).toEqual([]);
    const result = await verify();
    expect(result).toMatchObject({ ok: true });
    expect(result.lastSeq).toBeGreaterThanOrEqual(rows[99].seq);
  }, 120_000);

  it('ACC-AUD-6 tampering with one row\'s metadata makes verification fail at that seq', async () => {
    const { writePlatformAuditLog } = await import('../../services/platform-audit.service.js');
    const action = `test.audit.tamper.${uniqueSuffix()}`;
    for (let index = 0; index < 3; index += 1) await writePlatformAuditLog(prisma, { actorType: 'SYSTEM', actorId: 'acc-aud-6', action, metadata: { index } });
    const middle = (await prisma.platformAuditLog.findMany({ where: { action }, orderBy: { seq: 'asc' }, select: { id: true, seq: true } }))[1];

    const broken = await tampered(middle.id, verify);
    expect(broken).toMatchObject({ ok: false, firstBrokenSeq: middle.seq, firstBrokenId: middle.id, reason: 'HASH_MISMATCH' });
    expect(await verify()).toMatchObject({ ok: true });
  }, 60_000);

  it('ACC-AUD-7 one console mutation writes exactly one audit row (5 routes, all three writer paths)', async () => {
    const tenant = await createTestTenant(prisma);
    const reason = 'Audit row count check for WP-5.1';
    const cases: Array<{ name: string; permissions: Permission[]; run: () => Promise<{ statusCode: number; json: () => { hold?: { id: string } } }> }> = [];
    let holdId = '';
    cases.push({ name: 'incident declare (auditedMutation, transaction client)', permissions: ['platform.incidents.write'], run: () => app.inject({ method: 'POST', url: '/api/internal/incidents', payload: { title: `Audit test ${uniqueSuffix()}`, severity: 'SEV3' } }) });
    cases.push({ name: 'runbook create (auditedMutation)', permissions: ['platform.incidents.write'], run: () => app.inject({ method: 'POST', url: '/api/internal/incidents/runbooks', payload: { title: `Runbook ${uniqueSuffix()}`, body: 'Steps' } }) });
    cases.push({ name: 'legal hold create (writeInternalAudit)', permissions: ['trust.compliance.legal-hold.write'], run: async () => {
      const response = await app.inject({ method: 'POST', url: '/api/internal/compliance/legal-holds', payload: { tenantId: tenant.id, reason } });
      holdId = response.json<{ hold: { id: string } }>().hold?.id ?? '';
      return response;
    } });
    cases.push({ name: 'legal hold release (writeInternalAudit)', permissions: ['trust.compliance.legal-hold.write'], run: () => app.inject({ method: 'POST', url: `/api/internal/compliance/legal-holds/${holdId}/release`, payload: { reason } }) });
    cases.push({ name: 'audit verify (no handler row: the safety net writes it)', permissions: ['trust.audit.export'], run: () => app.inject({ method: 'POST', url: '/api/internal/audit/verify', payload: {} }) });

    for (const testCase of cases) {
      session.userId = `acc-aud-7-${uniqueSuffix()}`;
      session.permissions = testCase.permissions;
      const response = await testCase.run();
      expect(response.statusCode, testCase.name).toBeLessThan(300);
      expect(await settledRows(session.userId, 1), testCase.name).toBe(1);
    }
  }, 120_000);

  it('ACC-AUD-8 the nightly job records its result; a forced failure creates the CRITICAL activity and notifies audit readers', async () => {
    const { runScheduledJob } = await import('../../queues/scheduled-job-runner.js');
    const { auditChainVerifyJob } = await import('../../services/audit-chain.service.js');
    const { writePlatformAuditLog } = await import('../../services/platform-audit.service.js');

    const passing = await runScheduledJob(app, auditChainVerifyJob);
    const passed = await prisma.scheduledJobRun.findUniqueOrThrow({ where: { id: passing.runId! } });
    expect(passed).toMatchObject({ jobName: 'trust.audit-chain-verify', status: 'SUCCEEDED', triggeredBy: 'SCHEDULE' });
    expect(passed.result).toMatchObject({ ok: true });

    const row = await writePlatformAuditLog(prisma, { actorType: 'SYSTEM', actorId: 'acc-aud-8', action: `test.audit.job.${uniqueSuffix()}`, metadata: { forced: false } });
    const failing = await tampered(row.id, () => runScheduledJob(app, auditChainVerifyJob));
    const failed = await prisma.scheduledJobRun.findUniqueOrThrow({ where: { id: failing.runId! } });
    expect(failed.status).toBe('SUCCEEDED');
    expect(failed.result).toMatchObject({ ok: false, firstBrokenSeq: row.seq, reason: 'HASH_MISMATCH' });
    const activity = await prisma.platformActivity.findUnique({ where: { dedupeKey: `audit.chain_broken:${row.seq}` } });
    expect(activity).toMatchObject({ service: 'trust.audit', type: 'audit.chain_broken', severity: 'CRITICAL' });
    expect(await prisma.staffNotification.count({ where: { platformUserId: auditReaderId, event: 'audit.chain_broken' } })).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
