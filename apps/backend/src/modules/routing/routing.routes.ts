import type { FastifyInstance } from 'fastify';
import { getTenantContext } from '../../context/tenant.context.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { routeOptimizationQueue } from '../../queues/queues.js';
import { callEtaTrain, checkOptimizerHealth, extractCoords, tierToObjective } from './routing.service.js';
import type { Objective } from './routing.types.js';

export async function registerRoutingRoutes(app: FastifyInstance) {
  // POST /api/v1/routes — create a route from a list of shipments
  app.post(
    '/api/v1/routes',
    { preHandler: [app.authenticate, requireRole(['ADMIN', 'STAFF'])] },
    async (req, reply) => {
      const ctx = getTenantContext();
      const { vehicleId, date, shipmentIds } = req.body as {
        vehicleId?: string;
        date: string;
        shipmentIds: string[];
      };

      if (!shipmentIds?.length) throw app.httpErrors.badRequest('shipmentIds required');

      const shipments = await app.prisma.shipment.findMany({
        where: { id: { in: shipmentIds }, tenantId: ctx.tenantId }
      });
      if (shipments.length !== shipmentIds.length) throw app.httpErrors.badRequest('One or more shipments not found');

      const route = await app.prisma.route.create({
        data: {
          tenantId: ctx.tenantId,
          vehicleId,
          date: new Date(date),
          stops: {
            create: shipments.flatMap((s, idx) => [
              { shipmentId: s.id, stopOrder: idx * 2, sequence: idx * 2, type: 'PICKUP' },
              { shipmentId: s.id, stopOrder: idx * 2 + 1, sequence: idx * 2 + 1, type: 'DROPOFF' }
            ])
          }
        },
        include: { stops: true }
      });

      req.log.info({ routeId: route.id, stopCount: route.stops.length }, 'Route created');
      return reply.status(201).send(route);
    }
  );

  // POST /api/v1/routes/:routeId/optimize — enqueue optimization job
  // Accepts optional vehicleStart coords; if omitted worker falls back to first stop
  app.post(
    '/api/v1/routes/:routeId/optimize',
    { preHandler: [app.authenticate, requireRole(['ADMIN', 'STAFF'])] },
    async (req, reply) => {
      const ctx = getTenantContext();
      const { routeId } = req.params as { routeId: string };
      const { objective, useEtaModel, vehicleStart } = (req.body as {
        objective?: Objective;
        useEtaModel?: boolean;
        vehicleStart?: { lat: number; lng: number };
      }) ?? {};

      const route = await app.prisma.route.findFirst({
        where: { id: routeId, tenantId: ctx.tenantId },
        include: { stops: { include: { shipment: true } } }
      });
      if (!route) throw app.httpErrors.notFound('Route not found');
      if (!route.stops.length) throw app.httpErrors.badRequest('Route has no stops');

      const resolvedObjective = objective ?? (
        route.stops[0]?.shipment?.serviceTier
          ? tierToObjective(route.stops[0].shipment.serviceTier)
          : 'BALANCED'
      );

      await routeOptimizationQueue.add('optimize', {
        routeId,
        tenantId: ctx.tenantId,
        objective: resolvedObjective,
        useEtaModel: useEtaModel ?? true,
        vehicleStart
      });

      req.log.info({ routeId, objective: resolvedObjective }, 'Route optimization enqueued');
      return reply.status(202).send({ message: 'Optimization enqueued', routeId });
    }
  );

  // GET /api/v1/routes — list routes for the tenant
  app.get(
    '/api/v1/routes',
    { preHandler: [app.authenticate, requireRole(['ADMIN', 'STAFF'])] },
    async (req, reply) => {
      const ctx = getTenantContext();
      const { date, status } = req.query as { date?: string; status?: string };

      const routes = await app.prisma.route.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(date ? { date: { gte: new Date(date), lt: new Date(new Date(date).getTime() + 86_400_000) } } : {}),
          ...(status ? { status } : {})
        },
        include: {
          stops: {
            orderBy: { sequence: 'asc' },
            include: { shipment: { select: { trackingNumber: true, originAddress: true, destinationAddress: true } } }
          }
        },
        orderBy: { date: 'desc' },
        take: 50
      });

      return reply.send(routes);
    }
  );

  // GET /api/v1/routes/:routeId — single route with ordered stops + ETAs
  app.get(
    '/api/v1/routes/:routeId',
    { preHandler: [app.authenticate, requireRole(['ADMIN', 'STAFF'])] },
    async (req, reply) => {
      const ctx = getTenantContext();
      const { routeId } = req.params as { routeId: string };

      const route = await app.prisma.route.findFirst({
        where: { id: routeId, tenantId: ctx.tenantId },
        include: {
          stops: {
            orderBy: { sequence: 'asc' },
            include: {
              shipment: {
                select: { trackingNumber: true, originAddress: true, destinationAddress: true, serviceTier: true }
              }
            }
          }
        }
      });

      if (!route) throw app.httpErrors.notFound('Route not found');
      return reply.send(route);
    }
  );

  // PATCH /api/v1/routes/:routeId/stops/:stopId/arrive — field operator marks arrival at stop
  app.patch(
    '/api/v1/routes/:routeId/stops/:stopId/arrive',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const ctx = getTenantContext();
      const { routeId, stopId } = req.params as { routeId: string; stopId: string };

      const route = await app.prisma.route.findFirst({ where: { id: routeId, tenantId: ctx.tenantId } });
      if (!route) throw app.httpErrors.notFound('Route not found');

      const stop = await app.prisma.routeStop.findFirst({ where: { id: stopId, routeId } });
      if (!stop) throw app.httpErrors.notFound('Stop not found');

      const updated = await app.prisma.routeStop.update({
        where: { id: stopId },
        data: { arrivedAt: new Date(), status: 'ARRIVED' }
      });

      req.log.info({ stopId, routeId }, 'Operator arrived at stop');
      return reply.send(updated);
    }
  );

  // POST /api/v1/routes/eta/train — retrain ETA model from completed route history
  app.post(
    '/api/v1/routes/eta/train',
    { preHandler: [app.authenticate, requireRole(['ADMIN'])] },
    async (req, reply) => {
      const ctx = getTenantContext();

      const stops = await app.prisma.routeStop.findMany({
        where: {
          route: { tenantId: ctx.tenantId },
          arrivedAt: { not: null },
          estimatedAt: { not: null }
        },
        include: { shipment: { select: { originAddress: true, destinationAddress: true } } },
        take: 500
      });

      if (stops.length < 10) {
        throw app.httpErrors.badRequest(
          `Need at least 10 completed stops for training (have ${stops.length})`
        );
      }

      const rows = stops
        .map((s) => {
          const fromCoords = extractCoords(s.shipment?.originAddress);
          const toCoords = extractCoords(s.shipment?.destinationAddress);
          if (!fromCoords || !toCoords || !s.estimatedAt || !s.arrivedAt) return null;
          return {
            fromLat: fromCoords.lat,
            fromLng: fromCoords.lng,
            toLat: toCoords.lat,
            toLng: toCoords.lng,
            departedAt: s.estimatedAt.toISOString(),
            arrivedAt: s.arrivedAt.toISOString()
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length < 10) {
        throw app.httpErrors.badRequest(
          `Only ${rows.length} stops have resolvable coordinates (need at least 10)`
        );
      }

      const result = await callEtaTrain(rows);
      req.log.info({ rowsUsed: result.rowsUsed }, 'ETA model retrained');
      return reply.send(result);
    }
  );

  // GET /api/v1/routes/health — optimizer service health probe
  app.get(
    '/api/v1/routes/health',
    { preHandler: [app.authenticate, requireRole(['ADMIN'])] },
    async (_req, reply) => {
      const healthy = await checkOptimizerHealth();
      return reply.status(healthy ? 200 : 503).send({ optimizerReachable: healthy });
    }
  );
}
