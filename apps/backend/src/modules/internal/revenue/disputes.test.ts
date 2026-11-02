import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// revenue.disputes (WP-4.6) against real Postgres: Stripe charge.dispute.* events upsert one dispute (idempotent,
// matched to the payment's tenant, never older-over-newer), evidence goes to Stripe with an idempotency key, a dispute
// due within 72 h warns once and shows on the badge, notes are activity, suspension is never automatic.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));
const stripe = vi.hoisted(() => ({ configured: true, submitDisputeEvidence: vi.fn(async () => ({ id: 'dp_x', status: 'under_review' })) }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'disputes@fauward.test', name: 'Dispute Desk', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_disputes', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));
vi.mock('../../../services/vendors/stripe.adapter.js', () => ({
  stripeAdapter: { vendor: 'stripe', isConfigured: () => stripe.configured, missingEnv: () => (stripe.configured ? [] : ['STRIPE_SECRET_KEY']), submitDisputeEvidence: stripe.submitDisputeEvidence }
}));

const HOUR = 3_600_000;

function disputeEvent(input: { eventId: string; disputeId: string; status: string; created: number; paymentIntent?: string; dueInHours?: number; amount?: number; type?: string }) {
  return {
    id: input.eventId,
    type: input.type ?? 'charge.dispute.created',
    created: input.created,
    data: {
      object: {
        id: input.disputeId,
        object: 'dispute',
        amount: input.amount ?? 4900,
        currency: 'gbp',
        reason: 'fraudulent',
        status: input.status,
        charge: `ch_${input.disputeId}`,
        payment_intent: input.paymentIntent ?? null,
        evidence_details: { due_by: Math.floor((Date.now() + (input.dueInHours ?? 240) * HOUR) / 1000) },
        metadata: {}
      }
    }
  };
}

describe.runIf(HAS_TEST_DB)('revenue.disputes (WP-4.6, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['revenue.disputes.read', 'revenue.disputes.write'];
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleDisputeRoutes } = await import('./disputes.routes.js');
    await registerConsoleDisputeRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    stripe.configured = true;
    stripe.submitDisputeEvidence.mockClear();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-DSP-1 the webhook upsert is idempotent, matches the tenant through the payment and ignores older events', async () => {
    const { upsertDisputeFromStripe } = await import('../../../services/dispute.service.js');
    const tenant = await createTestTenant(prisma);
    const intent = `pi_${uniqueSuffix()}`;
    await prisma.payment.create({ data: { kind: 'PLATFORM', tenantId: tenant.id, amount: '49.00', currency: 'GBP', method: 'CARD', status: 'COMPLETED', gatewayRef: intent } });
    const disputeId = `dp_${uniqueSuffix()}`;
    const now = Math.floor(Date.now() / 1000);
    const created = disputeEvent({ eventId: `evt_${uniqueSuffix()}`, disputeId, status: 'needs_response', created: now, paymentIntent: intent });

    await upsertDisputeFromStripe(app, created);
    await upsertDisputeFromStripe(app, created); // redelivered
    const rows = await prisma.paymentDispute.findMany({ where: { stripeDisputeId: disputeId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: tenant.id, paymentKind: 'PLATFORM', status: 'needs_response', currency: 'GBP', reason: 'fraudulent' });
    expect(rows[0].amount.toFixed(2)).toBe('49.00');
    expect(await prisma.platformAuditLog.count({ where: { action: 'DISPUTE_OPENED', metadata: { path: ['stripeDisputeId'], equals: disputeId } } })).toBe(1);
    expect(await prisma.platformActivity.findFirst({ where: { subjectId: rows[0].id, type: 'dispute.created' } })).toMatchObject({ severity: 'ATTENTION', tenantId: tenant.id });

    await upsertDisputeFromStripe(app, disputeEvent({ eventId: `evt_${uniqueSuffix()}`, disputeId, status: 'lost', created: now + 60, type: 'charge.dispute.closed', paymentIntent: intent }));
    await upsertDisputeFromStripe(app, disputeEvent({ eventId: `evt_${uniqueSuffix()}`, disputeId, status: 'under_review', created: now + 30, type: 'charge.dispute.updated', paymentIntent: intent }));
    expect((await prisma.paymentDispute.findUniqueOrThrow({ where: { stripeDisputeId: disputeId } })).status).toBe('lost');
    // Never automatic: the tenant stays as it was.
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).status).toBe('ACTIVE');
    expect(await prisma.suspensionRecord.count({ where: { tenantId: tenant.id } })).toBe(0);

    const closed = (await app.inject({ method: 'GET', url: '/api/internal/disputes?status=CLOSED&limit=200' })).json();
    expect(closed.data.some((row: { stripeDisputeId: string }) => row.stripeDisputeId === disputeId)).toBe(true);
    const open = (await app.inject({ method: 'GET', url: '/api/internal/disputes?status=OPEN&limit=200' })).json();
    expect(open.data.some((row: { stripeDisputeId: string }) => row.stripeDisputeId === disputeId)).toBe(false);
  });

  it('ACC-DSP-2 evidence goes to Stripe disputes.update with an idempotency key; without Stripe it is refused', async () => {
    const { upsertDisputeFromStripe } = await import('../../../services/dispute.service.js');
    const disputeId = `dp_${uniqueSuffix()}`;
    const row = await upsertDisputeFromStripe(app, disputeEvent({ eventId: `evt_${uniqueSuffix()}`, disputeId, status: 'needs_response', created: Math.floor(Date.now() / 1000) }));
    const id = row!.id;

    stripe.configured = false;
    const refused = await app.inject({ method: 'POST', url: `/api/internal/disputes/${id}/evidence`, payload: { reason: 'Customer signed for delivery', evidence: { uncategorized_text: 'Signed POD attached in our system' } } });
    expect(refused.json()).toMatchObject({ error: 'STRIPE_NOT_CONFIGURED' });

    stripe.configured = true;
    const submitted = await app.inject({ method: 'POST', url: `/api/internal/disputes/${id}/evidence`, headers: { 'idempotency-key': 'ev-1' }, payload: { reason: 'Customer signed for delivery', evidence: { uncategorized_text: 'Signed POD attached in our system', customer_name: 'Jane Doe' } } });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({ status: 'under_review', idempotencyKey: 'dispute-evidence:ev-1' });
    expect(stripe.submitDisputeEvidence).toHaveBeenCalledWith(disputeId, { uncategorized_text: 'Signed POD attached in our system', customer_name: 'Jane Doe' }, 'dispute-evidence:ev-1');
    const detail = (await app.inject({ method: 'GET', url: `/api/internal/disputes/${id}` })).json();
    expect(detail).toMatchObject({ status: 'under_review', needsResponse: false, evidence: { customer_name: 'Jane Doe' } });
    const again = await app.inject({ method: 'POST', url: `/api/internal/disputes/${id}/evidence`, payload: { reason: 'Second try at evidence', evidence: { uncategorized_text: 'x' } } });
    expect(again.json()).toMatchObject({ error: 'NOT_RESPONDABLE' });
    expect(await prisma.platformAuditLog.count({ where: { action: 'DISPUTE_EVIDENCE_SUBMITTED', metadata: { path: ['disputeId'], equals: id } } })).toBe(1);
  });

  it('ACC-DSP-3 evidence due within 72 h warns once (ATTENTION activity + bell) and counts on the badge', async () => {
    const { upsertDisputeFromStripe, sweepDisputeDeadlines } = await import('../../../services/dispute.service.js');
    const { BADGES } = await import('../../../services/console-badges.service.js');
    const role = await prisma.staffRole.create({ data: { id: `test-disputes-${uniqueSuffix()}`, name: 'Dispute writers', description: 'test', permissions: ['revenue.disputes.write'] } });
    const holder = await createTestPlatformUser(prisma);
    const staffUser = await prisma.staffUser.create({ data: { platformUserId: holder.id, email: holder.email, name: 'Holder' } });
    await prisma.staffRoleAssignment.create({ data: { staffId: staffUser.id, roleId: role.id } });

    const soon = await upsertDisputeFromStripe(app, disputeEvent({ eventId: `evt_${uniqueSuffix()}`, disputeId: `dp_${uniqueSuffix()}`, status: 'needs_response', created: Math.floor(Date.now() / 1000), dueInHours: 30 }));
    const later = await upsertDisputeFromStripe(app, disputeEvent({ eventId: `evt_${uniqueSuffix()}`, disputeId: `dp_${uniqueSuffix()}`, status: 'needs_response', created: Math.floor(Date.now() / 1000), dueInHours: 200 }));
    const deps = { app, queues: {} as never, now: new Date() };
    const before = (await BADGES['disputes-due'].compute(deps, () => true)).value as number;

    await sweepDisputeDeadlines(app);
    await sweepDisputeDeadlines(app);
    expect(await prisma.platformActivity.count({ where: { subjectId: soon!.id, type: 'dispute.evidence_due' } })).toBe(1);
    expect(await prisma.platformActivity.findFirst({ where: { subjectId: soon!.id, type: 'dispute.evidence_due' } })).toMatchObject({ severity: 'ATTENTION' });
    expect(await prisma.platformActivity.count({ where: { subjectId: later!.id, type: 'dispute.evidence_due' } })).toBe(0);
    expect(await prisma.staffNotification.count({ where: { platformUserId: holder.id, link: `/revenue/disputes/${soon!.id}` } })).toBe(1);
    expect(before).toBeGreaterThanOrEqual(1);
    const list = (await app.inject({ method: 'GET', url: '/api/internal/disputes?limit=200' })).json();
    expect(list.data.find((row: { id: string }) => row.id === soon!.id)).toMatchObject({ dueSoon: true });
    expect(list.data.find((row: { id: string }) => row.id === later!.id)).toMatchObject({ dueSoon: false });
  });

  it('notes are recorded as activity and listed on the detail; writes need revenue.disputes.write', async () => {
    const { upsertDisputeFromStripe } = await import('../../../services/dispute.service.js');
    const row = await upsertDisputeFromStripe(app, disputeEvent({ eventId: `evt_${uniqueSuffix()}`, disputeId: `dp_${uniqueSuffix()}`, status: 'needs_response', created: Math.floor(Date.now() / 1000) }));
    const added = await app.inject({ method: 'POST', url: `/api/internal/disputes/${row!.id}/notes`, payload: { body: 'Asked the tenant for the signed POD' } });
    expect(added.statusCode).toBe(201);
    const detail = (await app.inject({ method: 'GET', url: `/api/internal/disputes/${row!.id}` })).json();
    expect(detail.notes[0]).toMatchObject({ body: 'Asked the tenant for the signed POD', author: 'Dispute Desk' });
    expect(detail.tenant).toBeNull();
    permissions.current = ['revenue.disputes.read'];
    expect((await app.inject({ method: 'POST', url: `/api/internal/disputes/${row!.id}/notes`, payload: { body: 'x' } })).statusCode).toBe(403);
    permissions.current = ['revenue.disputes.read', 'revenue.disputes.write'];
  });
});
