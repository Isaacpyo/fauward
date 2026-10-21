import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// platform.incidents (WP-4.2) against real Postgres: native incidents, public updates as INCIDENT announcements that the
// impacted tenant's banner endpoint returns, resolve expiring them, runbook CRUD + linking, SEV1 staff notification and
// the optional, HMAC-verified PagerDuty producer.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));
const mail = vi.hoisted(() => ({ tenant: [] as Array<{ template: string; tenantId: string }>, staff: [] as Array<{ platformUserId: string }> }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'incidents@fauward.test', name: 'Incident Lead', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_incidents', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
// Tenant-side session for the banner endpoint: the test names the tenant in a header.
vi.mock('../../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { headers: Record<string, string | undefined>; tenant?: unknown; user?: unknown }) => {
    request.tenant = { id: request.headers['x-test-tenant'], plan: request.headers['x-test-plan'] ?? 'STARTER' };
    request.user = { sub: `user-${request.headers['x-test-tenant']}` };
  }
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({
  sendEmail: vi.fn(async (_app: unknown, args: { template: string; tenantId: string }) => {
    mail.tenant.push({ template: args.template, tenantId: args.tenantId });
  }),
  sendStaffEmail: vi.fn(async (args: { platformUserId: string }) => {
    mail.staff.push({ platformUserId: args.platformUserId });
  })
}));

function pagerDutyHeaders(secret: string, payload: unknown, timestamp = String(Date.now())) {
  const signature = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  return { 'x-pagerduty-signature': `v1=${signature}`, 'x-pagerduty-request-timestamp': timestamp };
}

describe.runIf(HAS_TEST_DB)('platform.incidents (WP-4.2, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  const savedSecret = process.env.PAGERDUTY_WEBHOOK_SECRET;

  beforeAll(async () => {
    delete process.env.PAGERDUTY_WEBHOOK_SECRET;
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['platform.incidents.read', 'platform.incidents.write'];
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleIncidentRoutes } = await import('./incidents.routes.js');
    const { registerAnnouncementRoutes } = await import('../../announcements/announcements.routes.js');
    await registerConsoleIncidentRoutes(app);
    await registerAnnouncementRoutes(app);
    await app.ready();
  });

  afterEach(() => {
    delete process.env.PAGERDUTY_WEBHOOK_SECRET;
    permissions.current = ['platform.incidents.read', 'platform.incidents.write'];
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (savedSecret !== undefined) process.env.PAGERDUTY_WEBHOOK_SECRET = savedSecret;
  });

  async function tenantBanner(tenantId: string) {
    const response = await app.inject({ method: 'GET', url: '/api/v1/tenants/me/announcements', headers: { 'x-test-tenant': tenantId } });
    return response.json().announcements as Array<{ id: string; type: string; title: string; body: string; dismissible: boolean }>;
  }

  async function declare(body: Record<string, unknown>) {
    const response = await app.inject({ method: 'POST', url: '/api/internal/incidents', payload: body });
    expect(response.statusCode).toBe(201);
    return response.json() as { id: string; status: string; severity: string };
  }

  it('ACC-INC-1 create → tag tenant → public update: the impacted tenant’s banner shows it, another tenant’s does not', async () => {
    const impacted = await createTestTenant(prisma);
    const bystander = await createTestTenant(prisma);
    const incident = await declare({ title: `Label printing failing ${uniqueSuffix()}`, severity: 'SEV3', services: ['labels'], description: 'Carrier label API returns 500' });
    expect(incident).toMatchObject({ status: 'INVESTIGATING', severity: 'SEV3' });

    const impact = await app.inject({ method: 'POST', url: `/api/internal/incidents/${incident.id}/impacts`, payload: { tenantId: impacted.id, impactLevel: 'DEGRADED' } });
    expect(impact.statusCode).toBe(201);

    const update = await app.inject({ method: 'POST', url: `/api/internal/incidents/${incident.id}/updates`, payload: { body: 'Labels are delayed; we are on it.', isPublic: true, status: 'IDENTIFIED' } });
    expect(update.statusCode).toBe(201);
    expect(update.json().announcement).toMatchObject({ type: 'INCIDENT', targetAll: false, tenantIds: [impacted.id], state: 'ACTIVE' });

    const banner = await tenantBanner(impacted.id);
    expect(banner.find((item) => item.type === 'INCIDENT' && item.body === 'Labels are delayed; we are on it.')).toBeTruthy();
    expect((await tenantBanner(bystander.id)).some((item) => item.id === update.json().announcement.id)).toBe(false);

    const detail = (await app.inject({ method: 'GET', url: `/api/internal/incidents/${incident.id}` })).json();
    expect(detail).toMatchObject({ status: 'IDENTIFIED', publicSummary: 'Labels are delayed; we are on it.', impacts: [{ tenant: { id: impacted.id }, impactLevel: 'DEGRADED' }] });
    expect(detail.updates.map((item: { isPublic: boolean }) => item.isPublic)).toEqual([true, false]);
    expect(await prisma.platformAuditLog.count({ where: { action: 'INCIDENT_UPDATE_POSTED', metadata: { path: ['incidentId'], equals: incident.id } } })).toBe(1);
    expect(await prisma.platformActivity.count({ where: { subjectId: incident.id, type: 'incident.update_posted' } })).toBe(1);

    // A second public update edits the same announcement instead of stacking another banner.
    const second = await app.inject({ method: 'POST', url: `/api/internal/incidents/${incident.id}/updates`, payload: { body: 'Fix deployed, monitoring.', isPublic: true, status: 'MONITORING' } });
    expect(second.json().announcement.id).toBe(update.json().announcement.id);
    expect((await tenantBanner(impacted.id)).filter((item) => item.type === 'INCIDENT' && item.id === update.json().announcement.id)[0].body).toBe('Fix deployed, monitoring.');
  });

  it('ACC-INC-2 resolve expires the announcement and records the postmortem', async () => {
    const tenant = await createTestTenant(prisma);
    const incident = await declare({ title: `Tracking page slow ${uniqueSuffix()}`, severity: 'SEV4' });
    await app.inject({ method: 'POST', url: `/api/internal/incidents/${incident.id}/impacts`, payload: { tenantId: tenant.id } });
    const update = await app.inject({ method: 'POST', url: `/api/internal/incidents/${incident.id}/updates`, payload: { body: 'Tracking pages are slow.', isPublic: true } });
    const announcementId = update.json().announcement.id as string;
    expect((await tenantBanner(tenant.id)).some((item) => item.id === announcementId)).toBe(true);

    const resolved = await app.inject({ method: 'POST', url: `/api/internal/incidents/${incident.id}/resolve`, payload: { postmortemUrl: 'https://docs.fauward.com/pm/1', publicMessage: 'Resolved: tracking is back to normal.' } });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ incident: { status: 'RESOLVED', postmortemUrl: 'https://docs.fauward.com/pm/1' }, announcement: { id: announcementId, state: 'EXPIRED' } });
    expect((await tenantBanner(tenant.id)).some((item) => item.id === announcementId)).toBe(false);
    expect((await prisma.incidentRecord.findUniqueOrThrow({ where: { id: incident.id } })).resolvedAt).not.toBeNull();

    const again = await app.inject({ method: 'POST', url: `/api/internal/incidents/${incident.id}/resolve`, payload: {} });
    expect(again.statusCode).toBe(409);
    const late = await app.inject({ method: 'POST', url: `/api/internal/incidents/${incident.id}/updates`, payload: { body: 'late', isPublic: false } });
    expect(late.json()).toMatchObject({ error: 'INCIDENT_RESOLVED' });
    const active = (await app.inject({ method: 'GET', url: '/api/internal/incidents?status=ACTIVE' })).json();
    expect(active.data.some((item: { id: string }) => item.id === incident.id)).toBe(false);
  });

  it('ACC-INC-3 a signed PagerDuty webhook upserts by vendorId; unsigned or forged ones are refused', async () => {
    const vendorId = `PD${uniqueSuffix()}`;
    const payload = { event: { event_type: 'incident.triggered', data: { id: vendorId, title: 'Carrier API outage', status: 'triggered', urgency: 'high', service: { summary: 'carrier-api' } } } };

    const unconfigured = await app.inject({ method: 'POST', url: '/api/internal/incidents/webhooks/pagerduty', payload });
    expect(unconfigured.statusCode).toBe(503);

    process.env.PAGERDUTY_WEBHOOK_SECRET = 'pd_secret';
    const forged = await app.inject({ method: 'POST', url: '/api/internal/incidents/webhooks/pagerduty', headers: pagerDutyHeaders('wrong', payload), payload });
    expect(forged.statusCode).toBe(403);
    const replayed = await app.inject({ method: 'POST', url: '/api/internal/incidents/webhooks/pagerduty', headers: pagerDutyHeaders('pd_secret', payload, String(Date.now() - 6 * 60_000)), payload });
    expect(replayed.statusCode).toBe(400);
    expect(await prisma.incidentRecord.count({ where: { vendorId } })).toBe(0);

    const created = await app.inject({ method: 'POST', url: '/api/internal/incidents/webhooks/pagerduty', headers: pagerDutyHeaders('pd_secret', payload), payload });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ created: true, incident: { vendorId, status: 'INVESTIGATING', severity: 'SEV2' } });

    const resolvedPayload = { event: { event_type: 'incident.resolved', data: { id: vendorId, title: 'Carrier API outage', status: 'resolved' } } };
    const resolved = await app.inject({ method: 'POST', url: '/api/internal/incidents/webhooks/pagerduty', headers: pagerDutyHeaders('pd_secret', resolvedPayload), payload: resolvedPayload });
    expect(resolved.json()).toMatchObject({ created: false, incident: { vendorId, status: 'RESOLVED' } });
    const rows = await prisma.incidentRecord.findMany({ where: { vendorId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ vendor: 'pagerduty', serviceTags: ['carrier-api'] });
    expect(rows[0].resolvedAt).not.toBeNull();
  });

  it('ACC-INC-4 runbook CRUD, slug uniqueness and linking to an incident', async () => {
    const suffix = uniqueSuffix();
    const created = await app.inject({ method: 'POST', url: '/api/internal/incidents/runbooks', payload: { title: `Carrier API failover ${suffix}`, body: '1. Switch carrier\n2. Replay labels', service: `carrier-${suffix}` } });
    expect(created.statusCode).toBe(201);
    const runbook = created.json() as { id: string; slug: string };
    expect(runbook.slug).toBe(`carrier-api-failover-${suffix}`);
    const duplicate = await app.inject({ method: 'POST', url: '/api/internal/incidents/runbooks', payload: { title: 'Other', slug: runbook.slug, body: 'x' } });
    expect(duplicate.statusCode).toBe(409);

    const edited = await app.inject({ method: 'PATCH', url: `/api/internal/incidents/runbooks/${runbook.id}`, payload: { body: '1. Switch carrier\n2. Replay labels\n3. Tell tenants' } });
    expect(edited.json().body).toContain('Tell tenants');

    const incident = await declare({ title: `Carrier outage ${suffix}`, severity: 'SEV3', services: [`carrier-${suffix}`] });
    const suggested = (await app.inject({ method: 'GET', url: `/api/internal/incidents/${incident.id}` })).json();
    expect(suggested.runbooks.suggested.map((item: { id: string }) => item.id)).toContain(runbook.id);
    const linked = await app.inject({ method: 'PATCH', url: `/api/internal/incidents/${incident.id}`, payload: { runbookIds: [runbook.id] } });
    expect(linked.json().runbooks.linked.map((item: { id: string }) => item.id)).toEqual([runbook.id]);
    expect((await app.inject({ method: 'GET', url: `/api/internal/incidents/runbooks/${runbook.id}` })).json().linkedIncidents[0].id).toBe(incident.id);

    const removed = await app.inject({ method: 'DELETE', url: `/api/internal/incidents/runbooks/${runbook.id}` });
    expect(removed.json()).toMatchObject({ unlinkedIncidents: 1 });
    expect((await prisma.incidentRecord.findUniqueOrThrow({ where: { id: incident.id } })).runbookIds).toEqual([]);
    expect(await prisma.platformAuditLog.count({ where: { action: { startsWith: 'INCIDENT_RUNBOOK_' }, metadata: { path: ['runbookId'], equals: runbook.id } } })).toBe(3);
  });

  it('ACC-INC-5 a SEV1 notifies every holder of platform.incidents.read (bell + email); others get nothing', async () => {
    const suffix = uniqueSuffix();
    const role = await prisma.staffRole.create({ data: { id: `test-incidents-read-${suffix}`, name: `Incident readers ${suffix}`, description: 'test', permissions: ['platform.incidents.read'] } });
    const holder = await createTestPlatformUser(prisma);
    const other = await createTestPlatformUser(prisma);
    const holderStaff = await prisma.staffUser.create({ data: { platformUserId: holder.id, email: holder.email, name: 'Holder' } });
    await prisma.staffUser.create({ data: { platformUserId: other.id, email: other.email, name: 'Other' } });
    await prisma.staffRoleAssignment.create({ data: { staffId: holderStaff.id, roleId: role.id } });
    mail.staff = [];

    const incident = await declare({ title: `Total outage ${suffix}`, severity: 'SEV1' });

    const bell = await prisma.staffNotification.findMany({ where: { link: `/platform/incidents/${incident.id}`, event: 'incident.declared' } });
    expect(bell.map((row) => row.platformUserId)).toContain(holder.id);
    expect(bell.map((row) => row.platformUserId)).not.toContain(other.id);
    expect(bell.find((row) => row.platformUserId === holder.id)?.severity).toBe('CRITICAL');
    expect(mail.staff.map((item) => item.platformUserId)).toContain(holder.id);
    expect(await prisma.platformActivity.findFirst({ where: { subjectId: incident.id, type: 'incident.created' } })).toMatchObject({ severity: 'CRITICAL' });

    // SEV1 public updates also reach the impacted tenant's admins (in-app + incident_update email).
    const tenant = await createTestTenant(prisma);
    await prisma.user.create({ data: { tenantId: tenant.id, email: `admin-${suffix}@tenant.test`, passwordHash: 'x', role: 'TENANT_ADMIN', isActive: true } });
    await app.inject({ method: 'POST', url: `/api/internal/incidents/${incident.id}/impacts`, payload: { tenantId: tenant.id, impactLevel: 'OUTAGE' } });
    mail.tenant = [];
    const update = await app.inject({ method: 'POST', url: `/api/internal/incidents/${incident.id}/updates`, payload: { body: 'Everything is down; next update in 30 minutes.', isPublic: true } });
    expect(update.json()).toMatchObject({ notified: { tenants: 1, inApp: 1, emailsQueued: 1 }, announcement: { dismissible: false } });
    expect(mail.tenant).toEqual([{ template: 'incident_update', tenantId: tenant.id }]);
    expect(await prisma.inAppNotification.count({ where: { tenantId: tenant.id, type: 'incident.update' } })).toBe(1);
  });

  it('guards and validation: read-only staff cannot write, invalid severity → 400, unknown incident → 404', async () => {
    permissions.current = ['platform.incidents.read'];
    const forbidden = await app.inject({ method: 'POST', url: '/api/internal/incidents', payload: { title: 'Nope nope', severity: 'SEV3' } });
    expect(forbidden.statusCode).toBe(403);
    permissions.current = ['platform.incidents.read', 'platform.incidents.write'];
    const invalid = await app.inject({ method: 'POST', url: '/api/internal/incidents', payload: { title: 'Bad severity', severity: 'P1' } });
    expect(invalid.statusCode).toBe(400);
    const missing = await app.inject({ method: 'GET', url: '/api/internal/incidents/does-not-exist' });
    expect(missing.statusCode).toBe(404);
    const noTenant = await app.inject({ method: 'POST', url: '/api/internal/incidents/does-not-exist/impacts', payload: {} });
    expect(noTenant.json()).toMatchObject({ error: 'TENANT_REQUIRED' });
  });
});
