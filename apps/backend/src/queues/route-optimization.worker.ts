import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { bullmqConnection } from './queues.js';
import { callOptimizer, extractCoords, tierToObjective } from '../modules/routing/routing.service.js';
import type { RouteOptimizationJob } from '../modules/routing/routing.types.js';

const prisma = new PrismaClient();

export function startRouteOptimizationWorker() {
  const worker = new Worker<RouteOptimizationJob>(
    'route-optimization',
    async (job) => {
      const { routeId, tenantId, objective, useEtaModel, vehicleStart: providedStart } = job.data as RouteOptimizationJob & {
        vehicleStart?: { lat: number; lng: number };
      };

      job.log(`Starting optimization for route ${routeId}`);

      const route = await prisma.route.findFirst({
        where: { id: routeId, tenantId },
        include: {
          stops: {
            orderBy: { stopOrder: 'asc' },
            include: {
              shipment: {
                select: { originAddress: true, destinationAddress: true, serviceTier: true }
              }
            }
          }
        }
      });

      if (!route) throw new Error(`Route ${routeId} not found`);

      // Build optimizer stops — skip any stop without resolvable coordinates
      const optimizerStops = route.stops
        .map((stop) => {
          const address = stop.type === 'PICKUP'
            ? stop.shipment?.originAddress
            : stop.shipment?.destinationAddress;
          const coords = extractCoords(address);
          if (!coords) return null;
          return {
            id: stop.id,
            type: stop.type as 'PICKUP' | 'DROPOFF',
            lat: coords.lat,
            lng: coords.lng,
            serviceMinutes: 5,
            priority: 'NORMAL' as const
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (!optimizerStops.length) throw new Error('No stops with resolvable coordinates');

      // Vehicle start: use coordinates from job payload if provided,
      // otherwise fall back to first stop's location.
      // Field operators in fauward-Go send their location via POST /field/location;
      // the caller can forward those coords here via the optimize request body.
      const vehicleStart = providedStart ?? {
        lat: optimizerStops[0].lat,
        lng: optimizerStops[0].lng
      };

      // Resolve vehicle capacity from Vehicle model if one is assigned
      let capacity: number | undefined;
      if (route.vehicleId) {
        const vehicle = await prisma.vehicle.findUnique({
          where: { id: route.vehicleId },
          select: { capacityKg: true }
        });
        if (vehicle?.capacityKg) capacity = Number(vehicle.capacityKg);
      }

      const resolvedObjective = objective
        ?? (route.stops[0]?.shipment?.serviceTier
          ? tierToObjective(route.stops[0].shipment.serviceTier)
          : 'BALANCED');

      const optimizerRequest = {
        requestId: `${routeId}-${Date.now()}`,
        vehicle: { start: vehicleStart, capacity },
        constraints: {},
        stops: optimizerStops,
        options: {
          objective: resolvedObjective,
          seed: 42,
          explain: false,
          useEtaModel: useEtaModel ?? true
        }
      };

      job.log(`Calling optimizer: ${optimizerStops.length} stops, objective=${resolvedObjective}`);
      const result = await callOptimizer(optimizerRequest);

      // Write optimized sequence + ETAs back to RouteStop rows in a single transaction
      await prisma.$transaction(
        result.route.orderedStopIds.map((stopId, index) => {
          const leg = result.route.legs.find((l) => l.to === stopId);
          return prisma.routeStop.update({
            where: { id: stopId },
            data: {
              sequence: index,
              estimatedAt: leg ? new Date(leg.eta) : undefined
            }
          });
        })
      );

      await prisma.route.update({
        where: { id: routeId },
        data: {
          optimizedAt: new Date(),
          optimizationScore: {
            distanceKm: result.route.totalDistanceKm,
            durationMinutes: result.route.totalDurationMinutes,
            feasible: result.route.feasible,
            violations: result.route.violations.length
          }
        }
      });

      job.log(`Done — ${result.route.totalDistanceKm} km, feasible=${result.route.feasible}`);
    },
    { connection: bullmqConnection, concurrency: 2 }
  );

  worker.on('failed', (job, err) => {
    process.stderr.write(`[route-optimization] Job ${job?.id} failed: ${err.message}\n`);
  });

  return worker;
}
