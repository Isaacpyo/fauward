import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { getActiveSuspension } from '../../services/tenant-suspension.service.js';
import { notifyStaff } from '../../services/platform-notifier.service.js';
import { recordAndPublishActivity } from '../../services/platform-activity.service.js';

function tenantFrom(request: FastifyRequest, reply: FastifyReply) {
  const tenant = request.tenant;
  if (!tenant) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenant;
}

export async function registerAppealRoutes(app: FastifyInstance) {
  // What the SuspendedOverlay shows (D3): category, public reason, since when, and the appeal state. Never the internal
  // reason.
  app.get('/api/v1/tenants/me/suspension', { preHandler: [authenticate] }, async (request, reply) => {
    const tenant = tenantFrom(request, reply);
    if (!tenant) return;
    const suspended = tenant.status === 'SUSPENDED';
    const closed = tenant.status === 'CANCELLED';
    const [active, appeal] = await Promise.all([
      getActiveSuspension(app.prisma, tenant.id),
      app.prisma.tenantAppeal.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' } })
    ]);
    const relevantAppeal = appeal && (!active || !appeal.suspensionId || appeal.suspensionId === active.id) ? appeal : null;
    const pending = relevantAppeal ? ['OPEN', 'PENDING'].includes(relevantAppeal.status) : false;
    return reply.send({
      suspended,
      closed,
      category: active?.category ?? null,
      publicReason: active?.publicReason ?? tenant.suspensionReason ?? null,
      since: (tenant.suspendedAt ?? active?.createdAt)?.toISOString() ?? null,
      appealable: suspended && !closed && !pending,
      appeal: relevantAppeal
        ? {
            id: relevantAppeal.id,
            status: relevantAppeal.status,
            createdAt: relevantAppeal.createdAt.toISOString(),
            decidedAt: ['APPROVED', 'REJECTED'].includes(relevantAppeal.status) ? relevantAppeal.updatedAt.toISOString() : null,
            resolution: relevantAppeal.reviewNote ?? null
          }
        : null
    });
  });

  app.post('/api/v1/tenants/me/suspension-appeal', { preHandler: [authenticate] }, async (request, reply) => {
    const tenant = tenantFrom(request, reply);
    if (!tenant) return;
    // A closed tenant is never reactivated, so it cannot appeal (D3).
    if (tenant.status === 'CANCELLED') {
      return reply.status(409).send({ error: 'TENANT_CLOSED', message: 'This workspace has been closed and cannot be appealed.' });
    }
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

    // Trust & Safety hears about it (D6, ACC-NOT-4) and it shows in the console feed (L3).
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: request.log },
      {
        service: 'trust.safety',
        type: 'appeal.submitted',
        tenantId: tenant.id,
        actorType: 'TENANT_USER',
        actorId: request.user?.sub ?? null,
        actorLabel: contactEmail,
        subjectType: 'appeal',
        subjectId: appeal.id,
        summary: `${tenant.name ?? tenant.slug} appealed its suspension`,
        severity: 'ATTENTION',
        consoleLink: `/trust/safety/appeals?appeal=${appeal.id}`,
        dedupeKey: `appeal.submitted:${appeal.id}`
      }
    );
    await notifyStaff(app, {
      permission: 'trust.safety.read',
      event: 'appeal.submitted',
      title: `Suspension appeal from ${tenant.name ?? tenant.slug}`,
      body: reason.length > 200 ? `${reason.slice(0, 200)}…` : reason,
      link: `/trust/safety/appeals?appeal=${appeal.id}`,
      severity: 'ATTENTION',
      tenantId: tenant.id,
      email: true
    });

    reply.status(201).send({ appeal });
  });
}
