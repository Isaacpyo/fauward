import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';
import { renderPdf } from '../../../services/quote-pdf.js';

// gtm.contracts (WP-4.19) against real Postgres: a quote above the discount limit needs someone else holding
// gtm.contracts.discount.large; accepting a quote writes the MSA, makes the contract ACTIVE, adds an ACTIVE pricing
// override and the tenant's MRR becomes the quoted net price; a DocuSign send carries the generated PDF and a signer;
// the discounts view groups by real status; DocuSign "completed" runs the same accept flow.

const session = vi.hoisted(() => ({ permissions: [] as Permission[], userId: 'unset' }));
const docusign = vi.hoisted(() => ({ configured: false, createEnvelope: vi.fn() }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: session.userId, email: `${session.userId}@fauward.test`, name: 'Staff', status: 'ACTIVE', mfaEnabled: true },
      session: { id: `ps_${session.userId}`, mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: session.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../middleware/require-fresh-platform-mfa.js', () => ({ requireFreshMfa: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(session.permissions), jit: new Map(), permissions: session.permissions }))
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));
vi.mock('../../../services/vendors/docusign.adapter.js', () => ({
  docusignAdapter: {
    vendor: 'docusign',
    envNames: ['DOCUSIGN_ACCESS_TOKEN', 'DOCUSIGN_ACCOUNT_ID', 'DOCUSIGN_WEBHOOK_SECRET'],
    isConfigured: () => docusign.configured,
    missingEnv: () => (docusign.configured ? [] : ['DOCUSIGN_ACCESS_TOKEN', 'DOCUSIGN_ACCOUNT_ID']),
    webhookSecret: () => process.env.DOCUSIGN_WEBHOOK_SECRET ?? null,
    createEnvelope: docusign.createEnvelope
  }
}));

describe.runIf(HAS_TEST_DB)('gtm.contracts (WP-4.19, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let rep: string;
  let manager: string;

  const as = (userId: string, permissions: Permission[]) => {
    session.userId = userId;
    session.permissions = permissions;
  };
  const REP: Permission[] = ['gtm.contracts.read', 'gtm.contracts.write'];
  const MANAGER: Permission[] = ['gtm.contracts.read', 'gtm.contracts.write', 'gtm.contracts.discount.large'];
  const signedPdf = () => renderPdf([{ text: 'Signed' }]).toString('base64');

  async function quote(payload: Record<string, unknown>) {
    const response = await app.inject({ method: 'POST', url: '/api/internal/contracts/quotes', payload });
    expect(response.statusCode, response.body).toBe(201);
    return response.json();
  }
  const submit = (id: string) => app.inject({ method: 'POST', url: `/api/internal/contracts/quotes/${id}/submit` });
  const send = (id: string) => app.inject({ method: 'POST', url: `/api/internal/contracts/quotes/${id}/send` });
  const accept = (id: string) =>
    app.inject({ method: 'POST', url: `/api/internal/contracts/quotes/${id}/accept`, payload: { fileName: 'signed.pdf', contentType: 'application/pdf', dataBase64: signedPdf(), reason: 'Signed copy received from the customer' } });

  beforeAll(async () => {
    prisma = createTestPrisma();
    rep = (await createTestPlatformUser(prisma, { name: 'Rep' })).id;
    manager = (await createTestPlatformUser(prisma, { name: 'Manager' })).id;
    app = Fastify({ bodyLimit: 20 * 1024 * 1024 });
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleContractsRoutes } = await import('./contracts.routes.js');
    await registerConsoleContractsRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    as(rep, REP);
    docusign.configured = false;
    docusign.createEnvelope.mockReset();
    docusign.createEnvelope.mockResolvedValue({ envelopeId: `env_${uniqueSuffix()}`, status: 'sent' });
  });

  afterAll(async () => {
    delete process.env.DOCUSIGN_WEBHOOK_SECRET;
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-CPQ-1 a 25% discount needs a discount.large approver who is not the author; 20% does not', async () => {
    const tenant = await createTestTenant(prisma, { plan: 'PRO', status: 'ACTIVE' });
    const small = await quote({ tenantId: tenant.id, plan: 'PRO', termMonths: 12, discountPercent: 20 });
    expect(small).toMatchObject({ status: 'DRAFT', listMonthly: '79.00', netMonthly: '63.20', currency: 'GBP', needsApproval: [] });
    expect((await submit(small.id)).json()).toMatchObject({ status: 'APPROVED' });

    const big = await quote({ tenantId: tenant.id, plan: 'PRO', termMonths: 12, discountPercent: 25 });
    expect(big.needsApproval).toEqual(['Discount above 20%']);
    const submitted = (await submit(big.id)).json();
    expect(submitted).toMatchObject({ status: 'PENDING_APPROVAL', approvals: [{ status: 'PENDING', reasons: ['Discount above 20%'] }] });
    const contract = await prisma.customContract.findFirstOrThrow({ where: { id: submitted.contractId, tenantId: tenant.id } });
    expect(contract.status).toBe('DRAFT');
    const approvalId = submitted.approvals[0].id;
    expect((await send(big.id)).json()).toMatchObject({ error: 'NOT_APPROVED' });

    // The rep cannot decide (no permission); the author cannot decide even with it.
    const decide = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/internal/contracts/approvals/${approvalId}/decision`, payload });
    expect((await decide({ decision: 'APPROVED', reason: 'Strategic logo for Q4' })).statusCode).toBe(403);
    as(rep, MANAGER);
    expect((await decide({ decision: 'APPROVED', reason: 'Strategic logo for Q4' })).json()).toMatchObject({ error: 'SELF_APPROVAL' });
    as(manager, MANAGER);
    expect((await decide({ decision: 'APPROVED' })).json()).toMatchObject({ error: 'REASON_REQUIRED' });
    const decided = await decide({ decision: 'APPROVED', conditions: 'Annual prepay', reason: 'Strategic logo for Q4' });
    expect(decided.statusCode).toBe(200);
    expect(decided.json()).toMatchObject({ status: 'APPROVED', approvedBy: manager, approvals: [{ status: 'APPROVED', approverId: manager, conditions: 'Annual prepay' }] });
    expect((await decide({ decision: 'REJECTED', reason: 'Second decision fails' })).json()).toMatchObject({ error: 'ALREADY_DECIDED' });
    expect(await prisma.platformAuditLog.count({ where: { action: 'QUOTE_DISCOUNT_APPROVED', targetTenantId: tenant.id } })).toBe(1);
    expect(await prisma.staffNotification.count({ where: { platformUserId: rep, event: 'contracts.quote_approved' } })).toBeGreaterThanOrEqual(1);

    // A long term alone also needs approval; a rejected quote goes back to DRAFT when edited.
    as(rep, REP);
    const long = await quote({ tenantId: tenant.id, plan: 'PRO', termMonths: 36, discountPercent: 0 });
    const longSubmitted = (await submit(long.id)).json();
    expect(longSubmitted.approvals[0].reasons).toEqual(['Term over 24 months']);
    as(manager, MANAGER);
    await app.inject({ method: 'POST', url: `/api/internal/contracts/approvals/${longSubmitted.approvals[0].id}/decision`, payload: { decision: 'REJECTED', reason: 'Too long without a break clause' } });
    as(rep, REP);
    expect((await app.inject({ method: 'GET', url: `/api/internal/contracts/quotes/${long.id}` })).json()).toMatchObject({ status: 'REJECTED' });
    expect((await prisma.customContract.findFirstOrThrow({ where: { id: longSubmitted.contractId, tenantId: tenant.id } })).status).toBe('REJECTED');
    expect((await app.inject({ method: 'PATCH', url: `/api/internal/contracts/quotes/${long.id}`, payload: { termMonths: 24 } })).json()).toMatchObject({ status: 'DRAFT', needsApproval: [] });
  });

  it('ACC-CPQ-2 accept creates MSA + ACTIVE contract + ACTIVE pricing override, moves the plan, and MRR reflects the quote', async () => {
    const tenant = await createTestTenant(prisma, { plan: 'STARTER', status: 'ACTIVE' });
    await prisma.subscription.create({ data: { tenantId: tenant.id, plan: 'STARTER', status: 'ACTIVE' } });
    const created = await quote({ tenantId: tenant.id, plan: 'PRO', termMonths: 12, discountPercent: 10, signerName: 'Dana Ops', signerEmail: 'dana@tenant.test' });
    expect(created.netMonthly).toBe('71.10');
    await submit(created.id);
    const sent = (await send(created.id)).json();
    expect(sent).toMatchObject({ delivery: 'MANUAL', quote: { status: 'SENT' } });
    const pdf = await app.inject({ method: 'GET', url: `/api/internal/contracts/quotes/${created.id}/pdf` });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    expect((await app.inject({ method: 'POST', url: `/api/internal/contracts/quotes/${created.id}/accept`, payload: { fileName: 'x.pdf', contentType: 'application/pdf', dataBase64: Buffer.from('not a pdf').toString('base64'), reason: 'Signed copy received' } })).json()).toMatchObject({ error: 'NOT_A_PDF' });
    const accepted = await accept(created.id);
    expect(accepted.statusCode, accepted.body).toBe(200);
    const body = accepted.json();
    expect(body.quote).toMatchObject({ status: 'ACCEPTED', msa: { signedVia: 'MANUAL', fileName: 'signed.pdf' } });

    const contract = await prisma.customContract.findFirstOrThrow({ where: { id: body.contractId, tenantId: tenant.id } });
    expect(contract.status).toBe('ACTIVE');
    expect(contract.terms).toMatchObject({ monthlyAmount: '71.10', currency: 'GBP', plan: 'PRO', sourceQuoteId: created.id });
    const override = await prisma.pricingOverride.findFirstOrThrow({ where: { id: body.overrideId, tenantId: tenant.id } });
    expect(override).toMatchObject({ status: 'ACTIVE', contractId: contract.id, ruleType: 'discount_percent' });
    expect(override.discountPercent?.toFixed(2)).toBe('10.00');
    const msa = await prisma.msaAgreement.findFirstOrThrow({ where: { id: body.msaId, tenantId: tenant.id } });
    expect(msa).toMatchObject({ quoteId: created.id, contractId: contract.id, storageProvider: 'POSTGRES' });
    const document = await app.inject({ method: 'GET', url: `/api/internal/contracts/msas/${msa.id}/document` });
    expect(document.rawPayload.toString('latin1')).toContain('%PDF-');

    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, include: { subscription: true } });
    expect(after.plan).toBe('PRO');
    expect(after.subscription?.plan).toBe('PRO');
    const { mrrForSubscription } = await import('../../../services/revenue/mrr.service.js');
    expect(await mrrForSubscription(prisma, after, after.subscription)).toMatchObject({ amount: '71.10', currency: 'GBP', source: 'contract' });
    expect((await accept(created.id)).json()).toMatchObject({ error: 'NOT_SENT' });

    const msas = (await app.inject({ method: 'GET', url: '/api/internal/contracts/msas' })).json();
    expect(msas.data.find((row: { id: string }) => row.id === msa.id)).toMatchObject({ tenant: { id: tenant.id }, daysToRenewal: expect.any(Number) });

    // ENTERPRISE needs a list price and an approved KYC review before acceptance.
    const enterpriseTenant = await createTestTenant(prisma, { plan: 'PRO', status: 'ACTIVE' });
    expect((await app.inject({ method: 'POST', url: '/api/internal/contracts/quotes', payload: { tenantId: enterpriseTenant.id, plan: 'ENTERPRISE', termMonths: 12 } })).json()).toMatchObject({ error: 'PRICE_REQUIRED' });
    const enterprise = await quote({ tenantId: enterpriseTenant.id, plan: 'ENTERPRISE', termMonths: 12, listMonthly: '1500.00', currency: 'GBP' });
    await submit(enterprise.id);
    expect((await accept(enterprise.id)).json()).toMatchObject({ error: 'KYC_REQUIRED' });
  });

  it('ACC-CPQ-3 with DocuSign configured the envelope carries the generated quote PDF and a signer; completed accepts the quote', async () => {
    const tenant = await createTestTenant(prisma, { plan: 'PRO', status: 'ACTIVE' });
    const created = await quote({ tenantId: tenant.id, plan: 'PRO', termMonths: 12, discountPercent: 5 });
    await submit(created.id);
    docusign.configured = true;
    expect((await send(created.id)).json()).toMatchObject({ error: 'SIGNER_REQUIRED' });
    await prisma.salesQuote.updateMany({ where: { id: created.id, tenantId: tenant.id }, data: { signerName: 'Dana Ops', signerEmail: 'dana@tenant.test' } });
    const envelopeId = `env_${uniqueSuffix()}`;
    docusign.createEnvelope.mockResolvedValue({ envelopeId, status: 'sent' });
    const sent = (await send(created.id)).json();
    expect(sent).toMatchObject({ delivery: 'DOCUSIGN', quote: { status: 'SENT', docusignEnvelopeId: envelopeId } });
    const envelope = docusign.createEnvelope.mock.calls[0][0];
    expect(envelope.signers).toEqual([{ name: 'Dana Ops', email: 'dana@tenant.test' }]);
    expect(envelope.document.fileExtension).toBe('pdf');
    expect(Buffer.from(envelope.document.base64, 'base64').subarray(0, 5).toString('latin1')).toBe('%PDF-');

    process.env.DOCUSIGN_WEBHOOK_SECRET = 'ds_secret';
    const payload = { event: 'envelope-completed', data: { envelopeId, envelopeSummary: { status: 'completed', envelopeDocuments: [{ PDFBytes: signedPdf() }] } } };
    const raw = JSON.stringify(payload);
    const completed = await app.inject({
      method: 'POST',
      url: '/api/internal/contracts/webhooks/docusign',
      headers: { 'content-type': 'application/json', 'x-docusign-signature-1': createHmac('sha256', 'ds_secret').update(raw).digest('base64'), 'x-docusign-timestamp': String(Date.now()) },
      payload: raw
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({ received: true, ignored: false, quoteId: created.id });
    const msa = await prisma.msaAgreement.findFirstOrThrow({ where: { quoteId: created.id, tenantId: tenant.id } });
    expect(msa).toMatchObject({ signedVia: 'DOCUSIGN', storageProvider: 'POSTGRES' });
    expect(await prisma.customContract.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } })).toBe(1);
  });

  it('ACC-CPQ-4 the discounts view groups discounted quotes by their real status', async () => {
    const tenant = await createTestTenant(prisma, { plan: 'PRO', status: 'ACTIVE' });
    const draft = await quote({ tenantId: tenant.id, plan: 'PRO', termMonths: 12, discountPercent: 15 });
    const pending = await quote({ tenantId: tenant.id, plan: 'PRO', termMonths: 12, discountPercent: 30 });
    await submit(pending.id);
    const none = await quote({ tenantId: tenant.id, plan: 'PRO', termMonths: 12, discountPercent: 0 });
    const view = (await app.inject({ method: 'GET', url: '/api/internal/contracts/discounts' })).json();
    expect(view.approvalThresholdPercent).toBe(20);
    const group = (status: string) => view.groups.find((item: { status: string }) => item.status === status);
    expect(group('DRAFT').quotes.map((item: { id: string }) => item.id)).toContain(draft.id);
    expect(group('PENDING_APPROVAL').quotes.map((item: { id: string }) => item.id)).toContain(pending.id);
    const all = view.groups.flatMap((item: { quotes: Array<{ id: string }> }) => item.quotes.map((row) => row.id));
    expect(all).not.toContain(none.id);
    for (const item of view.groups) expect(item.quotes.every((row: { status: string }) => row.status === item.status)).toBe(true);
  });
});
