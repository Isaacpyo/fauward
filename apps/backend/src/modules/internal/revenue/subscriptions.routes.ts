import type { FastifyInstance, FastifyReply } from 'fastify';
import { KycError, assertKycForEnterprise } from '../../../services/kyc.service.js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Permission } from '@fauward/internal-rbac';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { staffPermissionContextForPlatformUser } from '../../../services/staff-iam.service.js';
import { mrrForSubscription } from '../../../services/revenue/mrr.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { PlanChangeError, cancelSubscriptionAtPeriodEnd, decidePlanChange, presentPlanChangeRequest } from '../../../services/plan-change.service.js';
import { writeInternalAudit } from '../internal-audit.js';

// revenue.subscriptions (WP-2.7): subscriptions with MRR, one tenant's detail (events, overrides, contracts, plan
// change requests), the plan-change queue and decision, cancel at period end, contracts and pricing overrides
// (ACTIVE overrides and contracts feed mrrForSubscription).

const listQuery = z.object({
  plan: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  cycle: z.enum(['MONTHLY', 'ANNUAL']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional()
});
const queueQuery = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED', 'CHECKOUT_PENDING']).optional() });
const decisionBody = z.object({ decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().trim().min(8) });
const cancelBody = z.object({ reason: z.string().trim().min(8) });
const contractBody = z.object({
  tenantId: z.string().min(1),
  monthlyAmount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Monthly amount must be a decimal like 1500.00'),
  currency: z.string().trim().length(3).toUpperCase().default('GBP'),
  termStart: z.coerce.date(),
  termEnd: z.coerce.date(),
  msaUrl: z.string().url().optional(),
  reason: z.string().trim().max(2000).optional()
});
const activateBody = z.object({ reason: z.string().trim().max(2000).optional() });
const overrideBody = z.object({
  tenantId: z.string().min(1),
  discountPercent: z.coerce.number().gt(0).max(100),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
  contractId: z.string().min(1).optional(),
  reason: z.string().trim().min(8)
});

function validation(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ error: 'VALIDATION', message: error.issues.map((issue) => issue.message).join(' ') });
}

const read = { preHandler: [authenticatePlatformSession, requireConsolePermission('revenue.subscriptions.read')] };
const write = (permission: Permission) => ({ preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission(permission)] });
const danger = (permission: Permission) => ({ preHandler: dangerous(permission) });

type TenantLabel = { id: string; name: string; slug: string };
const tenantSelect = { id: true, name: true, slug: true, status: true, plan: true } as const;

function presentOverride(row: Prisma.PricingOverrideGetPayload<object>) {
  return { id: row.id, tenantId: row.tenantId, contractId: row.contractId, ruleType: row.ruleType, discountPercent: row.discountPercent?.toFixed(2) ?? null, validFrom: row.validFrom.toISOString(), validTo: row.validTo?.toISOString() ?? null, status: row.status, createdAt: row.createdAt.toISOString() };
}

function presentContract(row: Prisma.CustomContractGetPayload<object>) {
  const terms = row.terms && typeof row.terms === 'object' && !Array.isArray(row.terms) ? (row.terms as Record<string, unknown>) : {};
  return {
    id: row.id,
    tenantId: row.tenantId,
    msaUrl: row.msaUrl,
    termStart: row.termStart.toISOString(),
    termEnd: row.termEnd.toISOString(),
    monthlyAmount: typeof terms.monthlyAmount === 'string' || typeof terms.monthlyAmount === 'number' ? String(terms.monthlyAmount) : null,
    currency: typeof terms.currency === 'string' ? terms.currency : null,
    status: row.status,
    signedAt: row.signedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

async function tenantLabels(app: FastifyInstance, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, TenantLabel>();
  const rows = await app.prisma.tenant.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, slug: true } });
  return new Map(rows.map((row) => [row.id, row]));
}

export async function registerConsoleSubscriptionRoutes(app: FastifyInstance) {
  app.get('/api/internal/subscriptions', read, async (request, reply) => {
    const parsed = listQuery.safeParse(request.query ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const query = parsed.data;
    const rows = await app.prisma.subscription.findMany({
      where: { ...(query.plan ? { plan: query.plan } : {}), ...(query.status ? { status: query.status } : {}), ...(query.cycle ? { billingCycle: query.cycle } : {}) },
      include: { tenant: { select: tenantSelect } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const data = await Promise.all(
      page.map(async (row) => ({
        id: row.id,
        tenant: { id: row.tenant.id, name: row.tenant.name, slug: row.tenant.slug, status: row.tenant.status },
        plan: row.plan,
        billingCycle: row.billingCycle,
        status: row.status,
        managedByStripe: Boolean(row.stripeSubscriptionId),
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
        mrr: await mrrForSubscription(app.prisma, row.tenant, row),
        updatedAt: row.updatedAt.toISOString()
      }))
    );
    return reply.send({ data, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null });
  });

  app.get('/api/internal/subscriptions/plan-change-requests', read, async (request, reply) => {
    const parsed = queueQuery.safeParse(request.query ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const rows = await app.prisma.planChangeRequest.findMany({ where: parsed.data.status ? { status: parsed.data.status } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
    const tenants = await tenantLabels(app, rows.map((row) => row.tenantId));
    return reply.send({ data: rows.map((row) => presentPlanChangeRequest(row, tenants.get(row.tenantId) ?? null)) });
  });

  app.post('/api/internal/subscriptions/plan-change-requests/:id/decision', danger('revenue.subscriptions.write'), async (request, reply) => {
    const parsed = decisionBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { id } = request.params as { id: string };
    try {
      const decided = await decidePlanChange(app, request, { id, decision: parsed.data.decision, reason: parsed.data.reason });
      await writeInternalAudit(request, `subscriptions.plan_change.${parsed.data.decision.toLowerCase()}`, 'plan_change_request', id, { status: 'PENDING' }, { status: decided.status, toPlan: decided.toPlan }, parsed.data.reason, { targetTenantId: decided.tenantId });
      return reply.send({ request: decided });
    } catch (error) {
      if (error instanceof PlanChangeError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      throw error;
    }
  });

  app.get('/api/internal/subscriptions/contracts', read, async (_request, reply) => {
    const rows = await app.prisma.customContract.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    const tenants = await tenantLabels(app, rows.map((row) => row.tenantId));
    return reply.send({ data: rows.map((row) => ({ ...presentContract(row), tenant: tenants.get(row.tenantId) ?? null })) });
  });

  app.post('/api/internal/subscriptions/contracts', write('revenue.subscriptions.write'), async (request, reply) => {
    const parsed = contractBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const input = parsed.data;
    if (input.termEnd <= input.termStart) return reply.status(400).send({ error: 'VALIDATION', message: 'The term must end after it starts.' });
    const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const contract = await app.prisma.customContract.create({
      data: { tenantId: tenant.id, msaUrl: input.msaUrl ?? null, termStart: input.termStart, termEnd: input.termEnd, terms: { monthlyAmount: input.monthlyAmount, currency: input.currency }, status: 'DRAFT' }
    });
    await writeInternalAudit(request, 'subscriptions.contract.create', 'custom_contract', contract.id, null, { status: contract.status }, input.reason ?? null, { targetTenantId: tenant.id });
    return reply.status(201).send({ contract: presentContract(contract) });
  });

  // An ACTIVE contract replaces the list price in mrrForSubscription for its term.
  app.post('/api/internal/subscriptions/contracts/:id/activate', write('revenue.subscriptions.write'), async (request, reply) => {
    const parsed = activateBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { id } = request.params as { id: string };
    const contract = await app.prisma.customContract.findUnique({ where: { id } });
    if (!contract) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Contract not found' });
    // trust.kyc (WP-4.10): a contract for the ENTERPRISE plan needs an approved KYC review.
    const contractTerms = contract.terms && typeof contract.terms === 'object' && !Array.isArray(contract.terms) ? (contract.terms as Record<string, unknown>) : {};
    if (contractTerms.plan === 'ENTERPRISE') {
      try {
        await assertKycForEnterprise(app.prisma, contract.tenantId);
      } catch (error) {
        if (error instanceof KycError) return reply.status(error.statusCode).send({ error: error.code, message: error.message, ...error.extra });
        throw error;
      }
    }
    const claimed = await app.prisma.customContract.updateMany({ where: { id: contract.id, tenantId: contract.tenantId, status: 'DRAFT' }, data: { status: 'ACTIVE', signedAt: new Date() } });
    if (claimed.count !== 1) return reply.status(409).send({ error: 'NOT_DRAFT', message: `This contract is ${contract.status.toLowerCase()}.` });
    const after = await app.prisma.customContract.findFirstOrThrow({ where: { id: contract.id, tenantId: contract.tenantId } });
    await writeInternalAudit(request, 'subscriptions.contract.activate', 'custom_contract', contract.id, { status: contract.status }, { status: after.status }, parsed.data.reason ?? null, { targetTenantId: contract.tenantId });
    return reply.send({ contract: presentContract(after) });
  });

  app.get('/api/internal/subscriptions/overrides', read, async (_request, reply) => {
    const rows = await app.prisma.pricingOverride.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    const tenants = await tenantLabels(app, rows.map((row) => row.tenantId));
    return reply.send({ data: rows.map((row) => ({ ...presentOverride(row), tenant: tenants.get(row.tenantId) ?? null })) });
  });

  // A discount on one tenant's list price; ACTIVE at once (ACC-SUB-4). Larger discounts need senior roles.
  app.post('/api/internal/subscriptions/overrides', danger('revenue.subscriptions.override'), async (request, reply) => {
    const parsed = overrideBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const input = parsed.data;
    const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
    if (input.discountPercent > 25 && !context.roles.includes('CFO') && !context.roles.includes('ROOT')) {
      return reply.status(403).send({ error: 'CFO approval required', requiredRole: 'CFO' });
    }
    if (input.discountPercent >= 10 && !context.roles.some((role) => ['SALES_MANAGER', 'SALES_DIRECTOR', 'CFO', 'ROOT'].includes(role))) {
      return reply.status(403).send({ error: 'Sales manager approval required', requiredRole: 'SALES_MANAGER' });
    }
    const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true, name: true } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const discount = new Prisma.Decimal(input.discountPercent).toDecimalPlaces(2);
    const override = await app.prisma.pricingOverride.create({
      data: {
        tenantId: tenant.id,
        contractId: input.contractId ?? null,
        ruleType: 'discount_percent',
        ruleValue: { discountPercent: discount.toFixed(2) },
        discountPercent: discount,
        validFrom: input.validFrom ?? new Date(),
        validTo: input.validTo ?? null,
        status: 'ACTIVE'
      }
    });
    await writeInternalAudit(request, 'subscriptions.override.create', 'pricing_override', override.id, null, { status: override.status, discountPercent: discount.toFixed(2) }, input.reason, { targetTenantId: tenant.id });
    await recordAndPublishActivity({ prisma: app.prisma, redis: app.redis, log: request.log }, {
      service: 'revenue.subscriptions',
      type: 'pricing_override.created',
      tenantId: tenant.id,
      ...staffActor(request),
      subjectType: 'pricing_override',
      subjectId: override.id,
      summary: `${tenant.name}: ${discount.toFixed(2)}% pricing override`,
      consoleLink: `/revenue/subscriptions/${tenant.id}`,
      dedupeKey: `pricing_override.created:${override.id}`
    });
    return reply.status(201).send({ override: presentOverride(override) });
  });

  // One tenant only (ACC-SUB-3): the old console page showed the whole list here.
  app.get('/api/internal/subscriptions/:tenantId', read, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { ...tenantSelect, subscription: true } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const [events, overrides, contracts, requests, mrr] = await Promise.all([
      app.prisma.subscriptionEvent.findMany({ where: { tenantId }, orderBy: { occurredAt: 'desc' }, take: 50 }),
      app.prisma.pricingOverride.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
      app.prisma.customContract.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
      app.prisma.planChangeRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      mrrForSubscription(app.prisma, tenant, tenant.subscription)
    ]);
    const sub = tenant.subscription;
    return reply.send({
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status, plan: tenant.plan },
      subscription: sub
        ? { id: sub.id, plan: sub.plan, billingCycle: sub.billingCycle, status: sub.status, managedByStripe: Boolean(sub.stripeSubscriptionId), cancelAtPeriodEnd: sub.cancelAtPeriodEnd, currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null, currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null, trialEnd: sub.trialEnd?.toISOString() ?? null, cancelledAt: sub.cancelledAt?.toISOString() ?? null }
        : null,
      mrr,
      events: events.map((row) => ({ id: row.id, type: row.type, fromPlan: row.fromPlan, toPlan: row.toPlan, fromStatus: row.fromStatus, toStatus: row.toStatus, mrrBefore: row.mrrBefore?.toFixed(2) ?? null, mrrAfter: row.mrrAfter?.toFixed(2) ?? null, currency: row.currency, source: row.source, occurredAt: row.occurredAt.toISOString() })),
      overrides: overrides.map(presentOverride),
      contracts: contracts.map(presentContract),
      planChangeRequests: requests.map((row) => presentPlanChangeRequest(row))
    });
  });

  app.post('/api/internal/subscriptions/:tenantId/cancel', danger('revenue.subscriptions.write'), async (request, reply) => {
    const parsed = cancelBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { tenantId } = request.params as { tenantId: string };
    try {
      const result = await cancelSubscriptionAtPeriodEnd(app, request, { tenantId, reason: parsed.data.reason });
      await writeInternalAudit(request, 'subscriptions.cancel', 'subscription', tenantId, null, { cancelAtPeriodEnd: true, stripe: result.stripe }, parsed.data.reason, { targetTenantId: tenantId });
      return reply.send(result);
    } catch (error) {
      if (error instanceof PlanChangeError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      throw error;
    }
  });
}
