import type { FastifyInstance } from 'fastify';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { getPlatformTrackingView } from './tracking.service.js';

export async function registerPlatformTrackingRoutes(app: FastifyInstance) {
  // Cross-tenant tracking overview
  app.get(
    '/api/v1/platform/tracking',
    { preHandler: [authenticatePlatformSession] },
    async (request, reply) => {
      const query = request.query as {
        tenantId?: string;
        status?: string;
        hasException?: string;
        page?: string;
        limit?: string;
        stuckHours?: string;
      };

      const page = Math.max(1, Number(query.page ?? 1));
      const limit = Math.min(200, Math.max(1, Number(query.limit ?? 50)));
      const skip = (page - 1) * limit;
      const statusFilter = query.status ? query.status.split(',').map((s) => s.trim()) : undefined;
      const stuckThreshold = query.stuckHours
        ? new Date(Date.now() - Number(query.stuckHours) * 60 * 60 * 1000)
        : undefined;

      const where = {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(statusFilter ? { currentStatus: { in: statusFilter as never[] } } : {}),
        ...(query.hasException === 'true' ? { hasException: true } : {}),
        ...(stuckThreshold ? { lastEventAt: { lt: stuckThreshold } } : {})
      };

      const [snapshots, total] = await Promise.all([
        app.prisma.trackingSnapshot.findMany({
          where,
          include: {
            tenant: { select: { id: true, name: true, slug: true, status: true } },
            shipment: { select: { trackingNumber: true, status: true } }
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit
        }),
        app.prisma.trackingSnapshot.count({ where })
      ]);

      return reply.send({
        data: snapshots,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    }
  );

  // Full shipment tracking for superadmin
  app.get(
    '/api/v1/platform/tenants/:tenantId/shipments/:shipmentId/tracking',
    { preHandler: [authenticatePlatformSession] },
    async (request, reply) => {
      const { shipmentId } = request.params as { tenantId: string; shipmentId: string };

      const view = await getPlatformTrackingView(app.prisma, shipmentId);
      if (!view) return reply.status(404).send({ error: 'Shipment not found' });

      return reply.send(view);
    }
  );

  // Exceptions overview
  app.get(
    '/api/v1/platform/tracking/exceptions',
    { preHandler: [authenticatePlatformSession] },
    async (_request, reply) => {
      const snapshots = await app.prisma.trackingSnapshot.findMany({
        where: { hasException: true },
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
          shipment: { select: { trackingNumber: true } }
        },
        orderBy: { updatedAt: 'desc' },
        take: 200
      });

      return reply.send({ data: snapshots });
    }
  );

  // Stuck shipments — no update in 24+ hours while active
  app.get(
    '/api/v1/platform/tracking/stuck',
    { preHandler: [authenticatePlatformSession] },
    async (request, reply) => {
      const { hours = '24' } = request.query as { hours?: string };
      const threshold = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);
      const terminalStatuses = ['DELIVERED', 'RETURNED', 'CANCELLED'];

      const stuck = await app.prisma.trackingSnapshot.findMany({
        where: {
          lastEventAt: { lt: threshold },
          currentStatus: { notIn: terminalStatuses as never[] }
        },
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
          shipment: { select: { trackingNumber: true } }
        },
        orderBy: { lastEventAt: 'asc' },
        take: 200
      });

      return reply.send({ data: stuck, thresholdHours: Number(hours) });
    }
  );

  // Tracking health metrics
  app.get(
    '/api/v1/platform/tracking/health',
    { preHandler: [authenticatePlatformSession] },
    async (_request, reply) => {
      const [total, exceptions, stuck, delivered] = await Promise.all([
        app.prisma.trackingSnapshot.count(),
        app.prisma.trackingSnapshot.count({ where: { hasException: true } }),
        app.prisma.trackingSnapshot.count({
          where: {
            lastEventAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            currentStatus: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] as never[] }
          }
        }),
        app.prisma.trackingSnapshot.count({ where: { currentStatus: 'DELIVERED' } })
      ]);

      return reply.send({ total, exceptions, stuck, delivered, activeShipments: total - delivered });
    }
  );
}
