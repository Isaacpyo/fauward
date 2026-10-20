import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import {
  GatewayError,
  gatewayBody,
  listTenantGateways,
  parseProvider,
  presentTenantGateway,
  saveTenantGateway,
  setActiveProvider,
  testTenantGateway
} from '../../services/tenant-payment-gateway.service.js';

// L11 (WP-2.12): Settings → Integrations saves the tenant's payment gateways here (no localStorage, S12). Admins and
// finance users manage them; responses never contain a secret.

const pre = { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_FINANCE'])] };
const defaultBody = z.object({ activeProvider: z.string().min(1) });

function tenantIdOf(request: FastifyRequest) {
  return request.tenant?.id ?? request.user?.tenantId ?? null;
}

function actorOf(request: FastifyRequest) {
  const user = request.user!;
  return { userId: user.sub, label: user.impersonator ? 'Fauward staff (via impersonation)' : user.email };
}

function sendGatewayError(reply: FastifyReply, error: unknown) {
  if (error instanceof GatewayError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerPaymentGatewayRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenant/payment-gateways', pre, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    return reply.send(await listTenantGateways(app, tenantId));
  });

  app.patch('/api/v1/tenant/payment-gateways', pre, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const parsed = defaultBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: 'activeProvider is required' });
    try {
      await setActiveProvider(app, tenantId, parseProvider(parsed.data.activeProvider));
      return reply.send(await listTenantGateways(app, tenantId));
    } catch (error) {
      return sendGatewayError(reply, error);
    }
  });

  app.put('/api/v1/tenant/payment-gateways/:provider', pre, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const parsed = gatewayBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: parsed.error.issues[0]?.message });
    try {
      const provider = parseProvider((request.params as { provider: string }).provider);
      const row = await saveTenantGateway(app, tenantId, provider, parsed.data, actorOf(request));
      return reply.send(presentTenantGateway(provider, row));
    } catch (error) {
      return sendGatewayError(reply, error);
    }
  });

  app.post('/api/v1/tenant/payment-gateways/:provider/test', pre, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    try {
      const provider = parseProvider((request.params as { provider: string }).provider);
      const row = await testTenantGateway(app, tenantId, provider, actorOf(request));
      return reply.send(presentTenantGateway(provider, row));
    } catch (error) {
      return sendGatewayError(reply, error);
    }
  });
}
