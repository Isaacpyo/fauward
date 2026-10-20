import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';

// Console bell (D6). Session-only: every staff member reads and clears their own StaffNotification rows, so there is
// no permission to check; every query is scoped to the caller's PlatformUser id.

const listQuery = z.object({
  unread: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().uuid().optional()
});

export async function registerStaffNotificationRoutes(app: FastifyInstance) {
  app.get('/api/internal/notifications/staff', { preHandler: [authenticatePlatformSession] }, async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const { unread, limit, cursor } = parsed.data;
    const platformUserId = request.platform!.user.id;

    const [rows, unreadCount] = await Promise.all([
      app.prisma.staffNotification.findMany({
        where: { platformUserId, ...(unread === 'true' ? { readAt: null } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      }),
      app.prisma.staffNotification.count({ where: { platformUserId, readAt: null } })
    ]);
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return reply.send({ data, unreadCount, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null });
  });

  app.post('/api/internal/notifications/staff/read-all', { preHandler: [authenticatePlatformSession, requirePlatformCsrf] }, async (request, reply) => {
    const result = await app.prisma.staffNotification.updateMany({
      where: { platformUserId: request.platform!.user.id, readAt: null },
      data: { readAt: new Date() }
    });
    return reply.send({ updated: result.count });
  });

  app.post('/api/internal/notifications/staff/:id/read', { preHandler: [authenticatePlatformSession, requirePlatformCsrf] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await app.prisma.staffNotification.updateMany({
      where: { id, platformUserId: request.platform!.user.id, readAt: null },
      data: { readAt: new Date() }
    });
    if (result.count === 0) {
      const exists = await app.prisma.staffNotification.findFirst({ where: { id, platformUserId: request.platform!.user.id }, select: { id: true } });
      if (!exists) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Notification not found' });
    }
    return reply.send({ id, read: true });
  });
}
