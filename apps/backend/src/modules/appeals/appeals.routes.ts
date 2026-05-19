import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';

function tenantFrom(request: FastifyRequest, reply: FastifyReply) {
  const tenant = request.tenant;
  if (!tenant) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenant;
}

export async function registerAppealRoutes(app: FastifyInstance) {
  app.post('/api/v1/tenants/me/suspension-appeal', { preHandler: [authenticate] }, async (request, reply) => {
    const tenant = tenantFrom(request, reply);
    if (!tenant) return;
    if (tenant.status !== 'SUSPENDED') {
      return reply.status(400).send({ error: 'Tenant is not suspended' });
    }

    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? (request.body as Record<string, unknown>)
      : {};
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim().toLowerCase() : '';
    if (reason.length < 50 || !contactEmail) {
      return reply.status(400).send({ error: 'reason must be at least 50 characters and contactEmail is required' });
    }

    const existing = await app.prisma.tenantAppeal.findFirst({
      where: { tenantId: tenant.id, status: { in: ['OPEN', 'PENDING'] } },
      orderBy: { createdAt: 'desc' }
    });
    if (existing) return reply.status(409).send({ error: 'An appeal is already pending', appeal: existing });

    const suspension = await app.prisma.suspensionRecord.findFirst({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });

    const appeal = await app.prisma.tenantAppeal.create({
      data: {
        tenantId: tenant.id,
        suspensionId: suspension?.id ?? null,
        message: reason,
        contactEmail,
        status: 'PENDING'
      }
    });

    await app.prisma.notificationLog.create({
      data: {
        tenantId: tenant.id,
        channel: 'EMAIL',
        event: 'trust_safety_appeal_submitted',
        status: 'QUEUED'
      }
    });

    reply.status(201).send({ appeal });
  });
}
