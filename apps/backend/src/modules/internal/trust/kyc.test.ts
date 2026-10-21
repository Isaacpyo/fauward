import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// trust.kyc (WP-4.10) against real Postgres: a manual review is opened, evidence attached (staff and tenant), the
// decision sets Tenant.kycStatus and is audited; ENTERPRISE is refused without approval; the monthly rescreen creates
// PENDING screenings that staff decide (a MATCH raises a LEGAL safety signal); Persona backs a review when configured.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], roles: [] as string[], userId: 'unset' }));
const tenantSession = vi.hoisted(() => ({ tenantId: 'unset', userId: 'unset', role: 'TENANT_ADMIN' }));
const persona = vi.hoisted(() => ({ configured: false, createInquiry: vi.fn(async () => ({ inquiryId: 'inq_test', status: 'created' })) }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'kyc@fauward.test', name: 'KYC Officer', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_kyc', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: permissions.roles, rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current })),
  staffPermissionContextForPlatformUser: vi.fn(async () => ({ staff: null, roles: permissions.roles, permissions: permissions.current }))
}));
vi.mock('../../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: tenantSession.userId, email: 'owner@tenant.test', role: tenantSession.role, tenantId: tenantSession.tenantId };
    request.tenant = { id: tenantSession.tenantId };
  }
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));
vi.mock('../../../services/vendors/persona.adapter.js', () => ({
  personaAdapter: { vendor: 'persona', isConfigured: () => persona.configured, missingEnv: () => (persona.configured ? [] : ['PERSONA_API_KEY', 'PERSONA_INQUIRY_TEMPLATE_ID']), createInquiry: persona.createInquiry }
}));

const PDF = Buffer.from('%PDF-1.4 registration certificate').toString('base64');

function personaHeaders(secret: string, payload: unknown, timestamp = String(Date.now())) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(payload)}`).digest('hex');
  return { 'persona-signature': `t=${timestamp},v1=${signature}` };
}

describe.runIf(HAS_TEST_DB)('trust.kyc (WP-4.10, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleKycRoutes } = await import('./kyc.routes.js');
    const { registerTenantVerificationRoutes } = await import('../../tenants/verification.routes.js');
    const { registerConsoleTenantRoutes } = await import('../platform/tenants.routes.js');
    await registerConsoleKycRoutes(app);
    await registerTenantVerificationRoutes(app);
    await registerConsoleTenantRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    permissions.current = ['trust.kyc.read', 'trust.kyc.approve', 'revenue.subscriptions.override', 'platform.tenants.read'];
    permissions.roles = [];
    persona.configured = false;
    persona.createInquiry.mockClear();
  });

  afterEach(() => {
    delete process.env.PERSONA_WEBHOOK_SECRET;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function tenantWithAdmin() {
    const tenant = await createTestTenant(prisma, { plan: 'PRO' });
    const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `owner-${uniqueSuffix()}@tenant.test`, passwordHash: 'x', role: 'TENANT_ADMIN', isActive: true } });
    tenantSession.tenantId = tenant.id;
    tenantSession.userId = user.id;
    return tenant;
  }

  it('ACC-KYC-1 ACC-KYC-4 open → tenant uploads → staff evidence → approve sets kycStatus and audits', async () => {
    const tenant = await tenantWithAdmin();
    const opened = await app.inject({ method: 'POST', url: '/api/internal/kyc/reviews', payload: { tenantId: tenant.id, note: 'Please upload your certificate of incorporation.' } });
    expect(opened.statusCode).toBe(201);
    const reviewId = opened.json().id as string;
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).kycStatus).toBe('IN_REVIEW');
    expect(await prisma.inAppNotification.count({ where: { tenantId: tenant.id, type: 'kyc.documents_requested' } })).toBe(1);
    expect((await app.inject({ method: 'POST', url: '/api/internal/kyc/reviews', payload: { tenantId: tenant.id } })).json()).toMatchObject({ error: 'REVIEW_OPEN' });

    const view = (await app.inject({ method: 'GET', url: '/api/v1/tenants/me/verification' })).json();
    expect(view).toMatchObject({ kycStatus: 'IN_REVIEW', review: { status: 'OPEN', requestNote: 'Please upload your certificate of incorporation.', documents: [] } });
    const uploaded = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/verification/documents', payload: { fileName: 'incorporation.pdf', contentType: 'application/pdf', dataBase64: PDF } });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json().review.documents).toEqual([expect.objectContaining({ fileName: 'incorporation.pdf' })]);

    await app.inject({ method: 'POST', url: `/api/internal/kyc/reviews/${reviewId}/evidence`, payload: { fileName: 'companies-house.png', contentType: 'image/png', dataBase64: PDF, note: 'Companies House lookup' } });
    const detail = (await app.inject({ method: 'GET', url: `/api/internal/kyc/reviews/${reviewId}` })).json();
    expect(detail.evidence.map((item: { source: string; fileName: string }) => [item.source, item.fileName])).toEqual([['TENANT', 'incorporation.pdf'], ['STAFF', 'companies-house.png']]);
    expect(JSON.stringify(detail)).not.toContain('storageKey');
    const file = await app.inject({ method: 'GET', url: `/api/internal/kyc/reviews/${reviewId}/evidence/${detail.evidence[0].id}` });
    expect(file.rawPayload.toString()).toBe('%PDF-1.4 registration certificate');

    const noReason = await app.inject({ method: 'POST', url: `/api/internal/kyc/reviews/${reviewId}/decision`, payload: { decision: 'APPROVED' } });
    expect(noReason.json()).toMatchObject({ error: 'REASON_REQUIRED' });
    const approved = await app.inject({ method: 'POST', url: `/api/internal/kyc/reviews/${reviewId}/decision`, payload: { decision: 'APPROVED', reason: 'Documents match Companies House' } });
    expect(approved.json()).toMatchObject({ status: 'APPROVED', decisionReason: 'Documents match Companies House' });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).kycStatus).toBe('APPROVED');
    expect(await prisma.platformAuditLog.findFirst({ where: { action: 'KYC_REVIEW_APPROVED', targetTenantId: tenant.id } })).toMatchObject({ reason: 'Documents match Companies House' });
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenants/me/verification/documents', payload: { fileName: 'late.pdf', contentType: 'application/pdf', dataBase64: PDF } })).json()).toMatchObject({ error: 'NO_OPEN_REVIEW' });
  });

  it('ACC-KYC-2 an ENTERPRISE plan override is refused until KYC is approved', async () => {
    const tenant = await tenantWithAdmin();
    const refused = await app.inject({ method: 'POST', url: `/api/internal/tenants/${tenant.id}/plan-overrides`, payload: { plan: 'ENTERPRISE', reason: 'Enterprise pilot agreed by sales' } });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: 'KYC_REQUIRED', kycStatus: 'PENDING' });
    expect(await prisma.tenantPlanOverride.count({ where: { tenantId: tenant.id } })).toBe(0);
    const pro = await app.inject({ method: 'POST', url: `/api/internal/tenants/${tenant.id}/plan-overrides`, payload: { plan: 'PRO', reason: 'Trial of PRO features for a week' } });
    expect(pro.statusCode).toBeLessThan(300);
    await prisma.tenant.update({ where: { id: tenant.id }, data: { kycStatus: 'APPROVED' } });
    const allowed = await app.inject({ method: 'POST', url: `/api/internal/tenants/${tenant.id}/plan-overrides`, payload: { plan: 'ENTERPRISE', reason: 'Enterprise pilot agreed by sales' } });
    expect(allowed.statusCode).toBeLessThan(300);
  });

  it('ACC-KYC-3 the monthly rescreen creates one PENDING screening per tenant; a MATCH raises a LEGAL signal, never a suspension', async () => {
    const { monthlyRescreen } = await import('../../../services/kyc.service.js');
    const tenant = await tenantWithAdmin();
    await monthlyRescreen(app);
    await monthlyRescreen(app);
    const screenings = await prisma.sanctionsScreening.findMany({ where: { tenantId: tenant.id, source: 'MONTHLY_RESCREEN' } });
    expect(screenings).toHaveLength(1);
    expect(screenings[0]).toMatchObject({ status: 'PENDING', provider: 'manual' });

    const queue = (await app.inject({ method: 'GET', url: '/api/internal/kyc/screenings?status=PENDING' })).json();
    expect(queue.data.some((row: { id: string }) => row.id === screenings[0].id)).toBe(true);
    const match = await app.inject({ method: 'POST', url: `/api/internal/kyc/screenings/${screenings[0].id}/decision`, payload: { decision: 'MATCH', matchType: 'SANCTIONS', reason: 'Name and address match the OFSI list' } });
    expect(match.statusCode).toBe(200);
    expect(match.json().signalId).toEqual(expect.any(String));
    expect(await prisma.fraudSignal.findUniqueOrThrow({ where: { id: match.json().signalId } })).toMatchObject({ tenantId: tenant.id, category: 'LEGAL', source: 'kyc_screening' });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).status).toBe('ACTIVE');
    expect((await app.inject({ method: 'POST', url: `/api/internal/kyc/screenings/${screenings[0].id}/decision`, payload: { decision: 'CLEAR', reason: 'Changed my mind afterwards' } })).statusCode).toBe(409);

    // With a MATCH on file, approving KYC needs a COMPLIANCE_ADMIN.
    const opened = (await app.inject({ method: 'POST', url: '/api/internal/kyc/reviews', payload: { tenantId: tenant.id } })).json();
    const blocked = await app.inject({ method: 'POST', url: `/api/internal/kyc/reviews/${opened.id}/decision`, payload: { decision: 'APPROVED', reason: 'Documents look fine to me' } });
    expect(blocked.json()).toMatchObject({ error: 'SENIOR_APPROVAL_REQUIRED', requiredRole: 'COMPLIANCE_ADMIN' });
    permissions.roles = ['COMPLIANCE_ADMIN'];
    expect((await app.inject({ method: 'POST', url: `/api/internal/kyc/reviews/${opened.id}/decision`, payload: { decision: 'APPROVED', reason: 'Senior review: false positive, cleared' } })).statusCode).toBe(200);
  });

  it('ACC-KYC-5 with Persona configured a review creates an inquiry, and the signed webhook updates the review', async () => {
    const tenant = await tenantWithAdmin();
    const refused = await app.inject({ method: 'POST', url: '/api/internal/kyc/reviews', payload: { tenantId: tenant.id, provider: 'persona' } });
    expect(refused.json()).toMatchObject({ error: 'VENDOR_NOT_CONFIGURED' });
    persona.configured = true;
    const inquiryId = `inq_${uniqueSuffix()}`;
    persona.createInquiry.mockResolvedValueOnce({ inquiryId, status: 'created' });
    const opened = await app.inject({ method: 'POST', url: '/api/internal/kyc/reviews', payload: { tenantId: tenant.id, provider: 'persona' } });
    expect(opened.statusCode).toBe(201);
    expect(persona.createInquiry).toHaveBeenCalledWith({ referenceId: tenant.id, name: tenant.name });
    expect(opened.json()).toMatchObject({ provider: 'persona', inquiryId });

    process.env.PERSONA_WEBHOOK_SECRET = 'persona_secret';
    const payload = { data: { id: inquiryId, attributes: { 'reference-id': tenant.id, status: 'completed' } } };
    const hook = await app.inject({ method: 'POST', url: '/api/internal/kyc/webhooks/persona', headers: personaHeaders('persona_secret', payload), payload });
    expect(hook.json()).toMatchObject({ received: true, matched: true, reviewId: opened.json().id });
    const review = await prisma.kYCReview.findUniqueOrThrow({ where: { id: opened.json().id } });
    expect(review.payload).toMatchObject({ data: { id: inquiryId }, _webhookVerification: expect.any(Object) });
    // The verdict is evidence; the decision stays with staff.
    expect(review.status).toBe('OPEN');
  });
});
