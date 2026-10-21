import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// revenue.tax (WP-4.7) against real Postgres: a tenant uploads its certificate, staff approve it, the next PLATFORM
// invoice has 0 tax and an exemption note; revoking restores tax; Stripe tax_exempt is mirrored when configured and a
// mirror failure never undoes the decision; registrations are audited; /tax/returns is gone.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));
const tenantSession = vi.hoisted(() => ({ tenantId: 'unset', userId: 'unset', role: 'TENANT_ADMIN' }));
const stripe = vi.hoisted(() => ({ configured: false, fail: false, setCustomerTaxExempt: vi.fn() }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'tax@fauward.test', name: 'Tax Lead', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_tax', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
vi.mock('../../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: tenantSession.userId, email: 'finance@tenant.test', role: tenantSession.role, tenantId: tenantSession.tenantId };
    request.tenant = { id: tenantSession.tenantId };
  }
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));
vi.mock('../../../services/vendors/stripe.adapter.js', () => ({
  stripeAdapter: {
    vendor: 'stripe',
    isConfigured: () => stripe.configured,
    missingEnv: () => (stripe.configured ? [] : ['STRIPE_SECRET_KEY']),
    setCustomerTaxExempt: stripe.setCustomerTaxExempt
  }
}));

const PDF = Buffer.from('%PDF-1.4 test certificate').toString('base64');

describe.runIf(HAS_TEST_DB)('revenue.tax (WP-4.7, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let staff: { id: string; email: string };

  beforeAll(async () => {
    prisma = createTestPrisma();
    staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['revenue.tax.read', 'revenue.tax.write'];
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleTaxRoutes } = await import('./tax.routes.js');
    const { registerTenantTaxExemptionRoutes } = await import('../../tenants/tax-exemption.routes.js');
    await registerConsoleTaxRoutes(app);
    await registerTenantTaxExemptionRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    stripe.configured = false;
    stripe.fail = false;
    stripe.setCustomerTaxExempt.mockReset();
    stripe.setCustomerTaxExempt.mockImplementation(async () => {
      if (stripe.fail) throw new Error('stripe answered 500');
      return { id: 'cus_x', taxExempt: 'exempt' };
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function tenantWithAdmin() {
    const tenant = await createTestTenant(prisma);
    const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `fin-${uniqueSuffix()}@tenant.test`, passwordHash: 'x', role: 'TENANT_ADMIN', isActive: true } });
    tenantSession.tenantId = tenant.id;
    tenantSession.userId = user.id;
    tenantSession.role = 'TENANT_ADMIN';
    return tenant;
  }

  async function invoice(tenantId: string) {
    const { createPlatformInvoice } = await import('../../../services/platform-billing.service.js');
    return createPlatformInvoice(app, { tenantId, currency: 'GBP', lineItems: [{ description: 'Pro plan', quantity: 1, unitAmount: '100.00' }], taxRate: '20' }, { type: 'STAFF', platformUserId: staff.id, email: staff.email, label: 'Tax Lead' });
  }

  it('ACC-TAX-1 upload → approve → the next PLATFORM invoice has 0 tax and an exemption note', async () => {
    const tenant = await tenantWithAdmin();
    const before = await invoice(tenant.id);
    expect(before.taxAmount.toFixed(2)).toBe('20.00');

    const uploaded = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/tax-exemption', payload: { fileName: 'vat-exempt.pdf', contentType: 'application/pdf', dataBase64: PDF } });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json()).toMatchObject({ taxExempt: false, exemption: { status: 'PENDING', fileName: 'vat-exempt.pdf' } });
    const second = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/tax-exemption', payload: { fileName: 'again.pdf', contentType: 'application/pdf', dataBase64: PDF } });
    expect(second.json()).toMatchObject({ error: 'ALREADY_PENDING' });

    const queue = (await app.inject({ method: 'GET', url: '/api/internal/tax/exemptions?status=PENDING' })).json();
    const row = queue.data.find((item: { tenant: { id: string } }) => item.tenant.id === tenant.id);
    expect(row).toMatchObject({ status: 'PENDING', contentType: 'application/pdf' });
    const certificate = await app.inject({ method: 'GET', url: `/api/internal/tax/exemptions/${row.id}/certificate` });
    expect(certificate.headers['content-type']).toBe('application/pdf');
    expect(certificate.rawPayload.toString()).toBe('%PDF-1.4 test certificate');

    const noReason = await app.inject({ method: 'POST', url: `/api/internal/tax/exemptions/${row.id}/decision`, payload: { decision: 'APPROVE' } });
    expect(noReason.json()).toMatchObject({ error: 'REASON_REQUIRED' });
    const approved = await app.inject({ method: 'POST', url: `/api/internal/tax/exemptions/${row.id}/decision`, payload: { decision: 'APPROVE', reason: 'Valid charity exemption certificate' } });
    expect(approved.json()).toMatchObject({ exemption: { status: 'APPROVED' }, stripeMirror: { status: 'NOT_CONFIGURED' } });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).taxExempt).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/v1/tenants/me/tax-exemption' })).json()).toMatchObject({ taxExempt: true, exemption: { status: 'APPROVED' } });
    expect(await prisma.inAppNotification.count({ where: { tenantId: tenant.id, type: 'tax.exemption_approved' } })).toBe(1);

    const after = await invoice(tenant.id);
    expect(after.taxAmount.toFixed(2)).toBe('0.00');
    expect(after.total.toFixed(2)).toBe('100.00');
    expect(after.notes).toContain('Tax exempt');
    expect(await prisma.platformAuditLog.count({ where: { action: 'TAX_EXEMPTION_APPROVED', targetTenantId: tenant.id } })).toBe(1);
  });

  it('ACC-TAX-2 revoking restores tax; Stripe tax_exempt is mirrored and a mirror failure keeps the decision', async () => {
    const tenant = await tenantWithAdmin();
    await prisma.subscription.create({ data: { tenantId: tenant.id, plan: 'PRO', billingCycle: 'MONTHLY', status: 'ACTIVE', stripeCustomerId: `cus_${uniqueSuffix()}` } });
    await app.inject({ method: 'POST', url: '/api/v1/tenants/me/tax-exemption', payload: { fileName: 'cert.png', contentType: 'image/png', dataBase64: PDF } });
    const exemption = await prisma.taxExemption.findFirstOrThrow({ where: { tenantId: tenant.id, status: 'PENDING' } });

    stripe.configured = true;
    const approved = await app.inject({ method: 'POST', url: `/api/internal/tax/exemptions/${exemption.id}/decision`, payload: { decision: 'APPROVE', reason: 'Valid export exemption' } });
    expect(approved.json().stripeMirror).toMatchObject({ status: 'MIRRORED' });
    expect(stripe.setCustomerTaxExempt).toHaveBeenLastCalledWith(expect.stringMatching(/^cus_/), true, `tax-exempt:${exemption.id}:APPROVED`);

    stripe.fail = true;
    const revoked = await app.inject({ method: 'POST', url: `/api/internal/tax/exemptions/${exemption.id}/decision`, payload: { decision: 'REVOKE', reason: 'Certificate expired last month' } });
    expect(revoked.json()).toMatchObject({ exemption: { status: 'REVOKED' }, stripeMirror: { status: 'FAILED' } });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).taxExempt).toBe(false);
    const next = await invoice(tenant.id);
    expect(next.taxAmount.toFixed(2)).toBe('20.00');
    expect(next.notes ?? '').not.toContain('Tax exempt');
    const again = await app.inject({ method: 'POST', url: `/api/internal/tax/exemptions/${exemption.id}/decision`, payload: { decision: 'REVOKE', reason: 'Certificate expired last month' } });
    expect(again.statusCode).toBe(409);
  });

  it('a rejected certificate tells the tenant why and lets them upload again', async () => {
    const tenant = await tenantWithAdmin();
    await app.inject({ method: 'POST', url: '/api/v1/tenants/me/tax-exemption', payload: { fileName: 'blurry.jpg', contentType: 'image/jpeg', dataBase64: PDF } });
    const exemption = await prisma.taxExemption.findFirstOrThrow({ where: { tenantId: tenant.id, status: 'PENDING' } });
    await app.inject({ method: 'POST', url: `/api/internal/tax/exemptions/${exemption.id}/decision`, payload: { decision: 'REJECT', reason: 'The certificate is unreadable' } });
    expect((await app.inject({ method: 'GET', url: '/api/v1/tenants/me/tax-exemption' })).json()).toMatchObject({ taxExempt: false, exemption: { status: 'REJECTED', decisionReason: 'The certificate is unreadable' } });
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenants/me/tax-exemption', payload: { fileName: 'clear.pdf', contentType: 'application/pdf', dataBase64: PDF } })).statusCode).toBe(201);
    tenantSession.role = 'TENANT_STAFF';
    expect((await app.inject({ method: 'GET', url: '/api/v1/tenants/me/tax-exemption' })).statusCode).toBe(403);
    tenantSession.role = 'TENANT_ADMIN';
  });

  it('ACC-TAX-3 registration CRUD is audited and validated', async () => {
    const region = `GB-${uniqueSuffix()}`;
    const created = await app.inject({ method: 'POST', url: '/api/internal/tax/registrations', payload: { region, taxId: 'GB123456789', filingFrequency: 'QUARTERLY' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect((await app.inject({ method: 'POST', url: '/api/internal/tax/registrations', payload: { region, taxId: 'GB123456789', filingFrequency: 'QUARTERLY' } })).json()).toMatchObject({ error: 'DUPLICATE_REGISTRATION' });
    expect((await app.inject({ method: 'PATCH', url: `/api/internal/tax/registrations/${id}`, payload: { filingFrequency: 'MONTHLY' } })).json()).toMatchObject({ filingFrequency: 'MONTHLY' });
    expect((await app.inject({ method: 'DELETE', url: `/api/internal/tax/registrations/${id}` })).statusCode).toBe(200);
    const actions = (await prisma.platformAuditLog.findMany({ where: { action: { startsWith: 'TAX_REGISTRATION_' }, metadata: { path: ['registrationId'], equals: id } }, orderBy: { createdAt: 'asc' } })).map((row) => row.action);
    expect(actions).toEqual(['TAX_REGISTRATION_CREATED', 'TAX_REGISTRATION_UPDATED', 'TAX_REGISTRATION_DELETED']);
    permissions.current = ['revenue.tax.read'];
    expect((await app.inject({ method: 'POST', url: '/api/internal/tax/registrations', payload: { region: 'X', taxId: 'Y', filingFrequency: 'ANNUAL' } })).statusCode).toBe(403);
    permissions.current = ['revenue.tax.read', 'revenue.tax.write'];
  });

  it('ACC-TAX-4 /tax/returns is gone; the overview names unconfigured tax vendors', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/internal/tax/returns' })).statusCode).toBe(404);
    const overview = (await app.inject({ method: 'GET', url: '/api/internal/tax/overview' })).json();
    expect(Array.isArray(overview.registrations) && Array.isArray(overview.pendingExemptions)).toBe(true);
    expect(overview.vendors.anrok).toMatchObject({ configured: false });
  });
});
