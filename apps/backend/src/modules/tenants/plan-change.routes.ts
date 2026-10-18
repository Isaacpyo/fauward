import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { config } from '../../config/index.js';
import { stripeService } from '../payments/stripe.service.js';
import { PlanChangeError, planChangeOptions, presentPlanChangeRequest, requestPlanChange } from '../../services/plan-change.service.js';
import { SaveOfferError, redeemSaveOffer } from '../../services/save-offer.service.js';

// Tenant side of L6 (WP-2.7): plan options, plan change (Stripe or staff approval), Stripe billing portal, save offer
// redemption. "Contact billing" (no Stripe) files a BILLING_QUERY ticket through /api/v1/tenants/me/fauward-tickets.

const changeBody = z.object({ plan: z.string().trim().toUpperCase(), billingCycle: z.string().trim().toUpperCase().default('MONTHLY') });
const BILLING_ROLES = ['TENANT_ADMIN', 'TENANT_FINANCE'];

function errorReply(reply: FastifyReply, error: unknown) {
  if (error instanceof PlanChangeError || error instanceof SaveOfferError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerPlanChangeRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenants/me/plan-change', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    return reply.send(await planChangeOptions(app, tenantId));
  });

  app.post('/api/v1/tenants/me/plan-change', { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const parsed = changeBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: 'Choose a plan.' });
    try {
      const result = await requestPlanChange(app, request, { tenantId, userId: request.user?.sub ?? 'unknown', email: request.user?.email ?? null, toPlan: parsed.data.plan, billingCycle: parsed.data.billingCycle });
      return reply.status(result.kind === 'REQUESTED' ? 201 : 200).send(result);
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  app.get('/api/v1/tenants/me/plan-change-requests', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const rows = await app.prisma.planChangeRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return reply.send({ requests: rows.map((row) => presentPlanChangeRequest(row)) });
  });

  // "Manage billing": a Stripe billing portal session, or 409 so the portal offers "Contact billing" (ACC-SUB-5).
  app.post('/api/v1/tenants/me/billing/portal-session', { preHandler: [authenticate, requireRole(BILLING_ROLES)] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const subscription = await app.prisma.subscription.findUnique({ where: { tenantId }, select: { stripeCustomerId: true } });
    if (!stripeService.isConfigured() || !subscription?.stripeCustomerId) {
      return reply.status(409).send({ error: 'BILLING_PORTAL_UNAVAILABLE', message: 'Online billing management is not available for this workspace. Contact Fauward billing instead.' });
    }
    try {
      const session = await stripeService.createBillingPortalSession({ customerId: subscription.stripeCustomerId, returnUrl: `${config.tenantPortalUrl}/settings?tab=billing` });
      return reply.send({ url: session.url });
    } catch (error) {
      request.log.error({ err: error, tenantId }, 'Stripe billing portal session failed');
      return reply.status(502).send({ error: 'STRIPE_FAILED', message: 'Stripe could not open the billing portal. Try again or contact Fauward billing.' });
    }
  });

  app.post('/api/v1/tenants/me/save-offers/:code/redeem', { preHandler: [authenticate, requireRole(BILLING_ROLES)] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const { code } = request.params as { code: string };
    try {
      return reply.send(await redeemSaveOffer(app, request, { tenantId, code, userId: request.user?.sub ?? 'unknown', email: request.user?.email ?? null }));
    } catch (error) {
      return errorReply(reply, error);
    }
  });
}
