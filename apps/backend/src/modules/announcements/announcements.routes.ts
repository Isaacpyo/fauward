import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireInternalPermission } from '../../middleware/require-internal-permission.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';

const ANNOUNCEMENT_TYPES = new Set(['INFO', 'WARNING', 'MAINTENANCE']);

function normalizeType(value: unknown) {
  const type = typeof value === 'string' ? value.trim().toUpperCase() : 'INFO';
  return ANNOUNCEMENT_TYPES.has(type) ? type : 'INFO';
}

function dateOrNull(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function announcementPayload(body: Record<string, unknown>, createdBy: string) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const tenantIds = stringArray(body.tenantIds);
  const planTiers = stringArray(body.planTiers).map((plan) => plan.toUpperCase());
  const targetAll = body.targetAll === undefined ? tenantIds.length === 0 && planTiers.length === 0 : body.targetAll === true;

  return {
    type: normalizeType(body.type),
    title,
    body: text,
    targetAll,
    tenantIds,
    planTiers,
    cta: body.cta && typeof body.cta === 'object' ? body.cta : undefined,
    dismissible: body.dismissible !== false,
    expiresAt: dateOrNull(body.expiresAt),
    createdBy
  };
}

export async function registerAnnouncementRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenant/announcements', { preHandler: [authenticate] }, tenantAnnouncementsHandler);
  app.get('/api/v1/tenants/me/announcements', { preHandler: [authenticate] }, tenantAnnouncementsHandler);

  async function tenantAnnouncementsHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenant = request.tenant;
    if (!tenant) return reply.status(400).send({ error: 'Tenant context required' });

    const now = new Date();
    const announcements = await app.prisma.platformAnnouncement.findMany({
      where: {
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          {
            OR: [
              { targetAll: true },
              { tenantIds: { has: tenant.id } },
              { planTiers: { has: tenant.plan } },
              { AND: [{ tenantIds: { isEmpty: true } }, { planTiers: { isEmpty: true } }] }
            ]
          }
        ]
      },
      orderBy: { publishedAt: 'desc' },
      take: 20
    });

    reply.send({ announcements });
  }

  app.get(
    '/api/internal/announcements',
    { preHandler: [authenticatePlatformSession, requireInternalPermission('customer.comms.read')] },
    async (request, reply) => {
      const query = request.query as { status?: string };
      const now = new Date();
      const where =
        query.status === 'expired'
          ? { expiresAt: { lte: now } }
          : query.status === 'all'
            ? {}
            : { publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };

      const data = await app.prisma.platformAnnouncement.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: 100
      });
      reply.send({ data });
    }
  );

  app.post(
    '/api/internal/announcements',
    { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireInternalPermission('customer.comms.send')] },
    async (request, reply) => {
      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
      const payload = announcementPayload(body, request.platform!.user.id);
      if (!payload.title || !payload.body) return reply.status(400).send({ error: 'title and body are required' });

      const created = await app.prisma.platformAnnouncement.create({ data: payload });
      reply.status(201).send(created);
    }
  );

  app.patch(
    '/api/internal/announcements/:id',
    { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireInternalPermission('customer.comms.send')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
      const before = await app.prisma.platformAnnouncement.findUnique({ where: { id } });
      if (!before) return reply.status(404).send({ error: 'Announcement not found' });

      const data: Record<string, unknown> = {};
      if (typeof body.type === 'string') data.type = normalizeType(body.type);
      if (typeof body.title === 'string') data.title = body.title.trim();
      if (typeof body.body === 'string') data.body = body.body.trim();
      if (typeof body.targetAll === 'boolean') data.targetAll = body.targetAll;
      if (Array.isArray(body.tenantIds)) data.tenantIds = stringArray(body.tenantIds);
      if (Array.isArray(body.planTiers)) data.planTiers = stringArray(body.planTiers).map((plan) => plan.toUpperCase());
      if (body.cta !== undefined) data.cta = body.cta && typeof body.cta === 'object' ? body.cta : null;
      if (typeof body.dismissible === 'boolean') data.dismissible = body.dismissible;
      if (body.expiresAt !== undefined) data.expiresAt = dateOrNull(body.expiresAt);
      if (body.expireNow === true) data.expiresAt = new Date();

      const updated = await app.prisma.platformAnnouncement.update({ where: { id }, data });
      reply.send(updated);
    }
  );

  app.delete(
    '/api/internal/announcements/:id',
    { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireInternalPermission('customer.comms.send')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await app.prisma.platformAnnouncement.delete({ where: { id } });
      reply.status(204).send();
    }
  );
}
