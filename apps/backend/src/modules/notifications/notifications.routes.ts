import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';

type NotificationPayload = {
  tenantId: string;
  userIds: string[];
  type: string;
  title: string;
  body?: string;
  link?: string;
};

export async function createInAppNotifications(app: FastifyInstance, payload: NotificationPayload) {
  const uniqueUserIds = [...new Set(payload.userIds)];
  if (uniqueUserIds.length === 0) return;

  await app.prisma.inAppNotification.createMany({
    data: uniqueUserIds.map((userId) => ({
      tenantId: payload.tenantId,
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: payload.link
    }))
  });
}

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerNotificationsRoutes(app: FastifyInstance) {
  app.get('/api/v1/notifications', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const userId = request.user?.sub;
    if (!tenantId) return;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { isRead, limit = '50' } = request.query as { isRead?: string; limit?: string };
    const take = Math.max(1, Math.min(100, Number(limit) || 50));
    const where: { tenantId: string; userId: string; isRead?: boolean } = { tenantId, userId };
    if (isRead === 'true') where.isRead = true;
    if (isRead === 'false') where.isRead = false;

    const notifications = await app.prisma.inAppNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take
    });

    reply.send({ notifications });
  });

  app.patch('/api/v1/notifications/:id/read', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const userId = request.user?.sub;
    if (!tenantId) return;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    await app.prisma.inAppNotification.updateMany({
      where: { id, tenantId, userId },
      data: { isRead: true, readAt: new Date() }
    });

    reply.send({ success: true });
  });

  app.post('/api/v1/notifications/read-all', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const userId = request.user?.sub;
    if (!tenantId) return;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    await app.prisma.inAppNotification.updateMany({
      where: { tenantId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });

    reply.send({ success: true });
  });

  app.get('/api/v1/notifications/unread-count', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const userId = request.user?.sub;
    if (!tenantId) return;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const count = await app.prisma.inAppNotification.count({
      where: { tenantId, userId, isRead: false }
    });

    reply.send({ count });
  });
}

