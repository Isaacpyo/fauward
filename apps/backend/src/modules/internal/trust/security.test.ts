import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// trust.security (WP-4.11) against real Postgres: resolving an anomaly records who and why, IP blocks keep scope and
// expiry, revoking a console session makes that staff member's next request 401 (real session middleware), lists page.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset', sessionId: 'ps_security' }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'sec@fauward.test', name: 'Security Lead', status: 'ACTIVE', mfaEnabled: true },
      session: { id: permissions.sessionId, mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));

describe.runIf(HAS_TEST_DB)('trust.security (WP-4.11, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleSecurityRoutes } = await import('./security.routes.js');
    await registerConsoleSecurityRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    permissions.current = ['trust.security.read', 'trust.security.write'];
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-SECM-1 acknowledging then resolving an anomaly records who, when and the note', async () => {
    const anomaly = await prisma.securityAnomaly.create({ data: { anomalyType: 'failed_login_spike', severity: 'HIGH', status: 'OPEN', payload: { staffEmail: `x-${uniqueSuffix()}@fauward.test`, count: 12 } } });
    const ack = await app.inject({ method: 'POST', url: `/api/internal/security/anomalies/${anomaly.id}/acknowledge` });
    expect(ack.json()).toMatchObject({ status: 'ACKNOWLEDGED' });
    const short = await app.inject({ method: 'POST', url: `/api/internal/security/anomalies/${anomaly.id}/resolve`, payload: { note: 'ok' } });
    expect(short.statusCode).toBe(400);
    const resolved = await app.inject({ method: 'POST', url: `/api/internal/security/anomalies/${anomaly.id}/resolve`, payload: { note: 'Password reset for the account; spike was a script.' } });
    expect(resolved.json()).toMatchObject({ status: 'RESOLVED' });
    expect(await prisma.securityAnomaly.findUniqueOrThrow({ where: { id: anomaly.id } })).toMatchObject({ resolvedBy: permissions.userId, acknowledgedBy: permissions.userId, resolutionNote: 'Password reset for the account; spike was a script.' });
    expect((await app.inject({ method: 'POST', url: `/api/internal/security/anomalies/${anomaly.id}/acknowledge` })).statusCode).toBe(409);
    expect(await prisma.platformAuditLog.count({ where: { action: { in: ['SECURITY_ANOMALY_ACKNOWLEDGED', 'SECURITY_ANOMALY_RESOLVED'] }, metadata: { path: ['anomalyId'], equals: anomaly.id } } })).toBe(2);
  });

  it('ACC-SECM-2 an IP block is created with scope and expiry (dangerous), listed, and removed with a reason', async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
    await prisma.ipBlock.deleteMany({ where: { ipAddress: ip } });
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    expect((await app.inject({ method: 'POST', url: '/api/internal/security/ip-blocks', payload: { ipAddress: ip, scope: 'CONSOLE', expiresAt } })).json()).toMatchObject({ error: 'REASON_REQUIRED' });
    expect((await app.inject({ method: 'POST', url: '/api/internal/security/ip-blocks', payload: { ipAddress: 'not-an-ip', reason: 'Credential stuffing source' } })).statusCode).toBe(400);
    const created = await app.inject({ method: 'POST', url: '/api/internal/security/ip-blocks', payload: { ipAddress: ip, scope: 'CONSOLE', expiresAt, reason: 'Credential stuffing source' } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ ipAddress: ip, scope: 'CONSOLE', expiresAt });
    expect((await app.inject({ method: 'POST', url: '/api/internal/security/ip-blocks', payload: { ipAddress: ip, reason: 'Credential stuffing source' } })).json()).toMatchObject({ error: 'ALREADY_BLOCKED' });
    const list = (await app.inject({ method: 'GET', url: '/api/internal/security/ip-blocks?limit=200' })).json();
    expect(list.data.find((row: { ipAddress: string }) => row.ipAddress === ip)).toMatchObject({ scope: 'CONSOLE', active: true });
    expect(list.enforcement).toMatchObject({ enforced: false });
    const removed = await app.inject({ method: 'DELETE', url: `/api/internal/security/ip-blocks/${created.json().id}`, payload: { reason: 'Source was a partner’s NAT' } });
    expect(removed.json()).toMatchObject({ removed: true });
    expect(await prisma.ipBlock.count({ where: { ipAddress: ip } })).toBe(0);
  });

  it('ACC-SECM-3 revoking a console session makes that staff member’s next request 401', async () => {
    const actual = await vi.importActual<typeof import('../../../middleware/authenticate-platform-session.js')>('../../../middleware/authenticate-platform-session.js');
    const { signPlatformAccessToken } = await import('../../../services/platform-session.service.js');
    const other = await createTestPlatformUser(prisma);
    const session = await prisma.platformSession.create({ data: { platformUserId: other.id, refreshTokenHash: `hash-${uniqueSuffix()}`, mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000), ipAddress: '198.51.100.7' } });
    const token = signPlatformAccessToken({ platformUserId: other.id, role: other.role, sessionId: session.id, mfaVerifiedAt: new Date() });
    const probe = Fastify();
    probe.decorate('prisma', prisma);
    probe.get('/probe', { preHandler: (request: FastifyRequest, reply: FastifyReply) => actual.authenticatePlatformSession(request, reply) }, async () => ({ ok: true }));
    await probe.ready();
    const call = () => probe.inject({ method: 'GET', url: '/probe', headers: { authorization: `Bearer ${token}` } });
    expect((await call()).statusCode).toBe(200);

    const sessions = (await app.inject({ method: 'GET', url: '/api/internal/security/sessions?limit=200' })).json();
    expect(sessions.data.find((row: { id: string }) => row.id === session.id)).toMatchObject({ user: { id: other.id }, ipAddress: '198.51.100.7' });
    const revoked = await app.inject({ method: 'POST', url: `/api/internal/security/sessions/${session.id}/revoke`, payload: { reason: 'Laptop reported stolen' } });
    expect(revoked.statusCode).toBe(200);
    expect((await call()).statusCode).toBe(401);
    expect(await prisma.staffNotification.count({ where: { platformUserId: other.id, event: 'security.session_revoked' } })).toBe(1);
    permissions.sessionId = session.id;
    expect((await app.inject({ method: 'POST', url: `/api/internal/security/sessions/${session.id}/revoke`, payload: { reason: 'Laptop reported stolen' } })).statusCode).toBe(409);
    permissions.sessionId = 'ps_security';
    await probe.close();
  });

  it('ACC-SECM-4 anomalies, logins and sessions page with a cursor; the logins view says tenant sign-ins are not recorded', async () => {
    const email = `page-${uniqueSuffix()}@fauward.test`;
    await prisma.staffLoginAttempt.createMany({ data: Array.from({ length: 3 }, (_, index) => ({ staffEmail: email, success: index === 0, ipAddress: '192.0.2.1', createdAt: new Date(Date.now() - index * 1000) })) });
    const first = (await app.inject({ method: 'GET', url: `/api/internal/security/logins?email=${encodeURIComponent(email)}&limit=2` })).json();
    expect(first.data).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    expect(first.tenantLogins).toMatchObject({ available: false });
    const second = (await app.inject({ method: 'GET', url: `/api/internal/security/logins?email=${encodeURIComponent(email)}&limit=2&cursor=${first.nextCursor}` })).json();
    expect(second.data).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const failed = (await app.inject({ method: 'GET', url: `/api/internal/security/logins?email=${encodeURIComponent(email)}&outcome=FAILED` })).json();
    expect(failed.data).toHaveLength(2);
    permissions.current = ['trust.security.read'];
    expect((await app.inject({ method: 'POST', url: '/api/internal/security/ip-blocks', payload: { ipAddress: '192.0.2.9', reason: 'Read-only staff cannot do this' } })).statusCode).toBe(403);
  });
});
