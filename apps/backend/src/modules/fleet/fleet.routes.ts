import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';

const FLEET_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER'] as const;

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerFleetRoutes(app: FastifyInstance) {
  app.get('/api/v1/fleet/vehicles', { preHandler: [authenticate, requireRole([...FLEET_ROLES])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const vehicles = await app.prisma.vehicle.findMany({
      where: { tenantId },
      include: {
        drivers: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    reply.send({ vehicles });
  });

  app.post('/api/v1/fleet/vehicles', { preHandler: [authenticate, requireRole([...FLEET_ROLES])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const payload = request.body as {
      registration?: string;
      type?: string;
      capacityKg?: number;
      capacityM3?: number;
      make?: string;
      model?: string;
    };

    if (!payload.registration) return reply.status(400).send({ error: 'registration is required' });

    const vehicle = await app.prisma.vehicle.create({
      data: {
        tenantId,
        registration: payload.registration,
        type: payload.type,
        capacityKg: payload.capacityKg ?? null,
        capacityM3: payload.capacityM3 ?? null,
        make: payload.make,
        model: payload.model
      }
    });
    reply.status(201).send(vehicle);
  });

  app.patch('/api/v1/fleet/vehicles/:id', { preHandler: [authenticate, requireRole([...FLEET_ROLES])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const { id } = request.params as { id: string };
    const payload = request.body as {
      registration?: string;
      type?: string;
      capacityKg?: number;
      capacityM3?: number;
      make?: string;
      model?: string;
      isActive?: boolean;
      driverId?: string | null;
    };

    const existing = await app.prisma.vehicle.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Vehicle not found' });

    const vehicle = await app.prisma.vehicle.update({
      where: { id: existing.id },
      data: {
        registration: payload.registration,
        type: payload.type,
        capacityKg: payload.capacityKg,
        capacityM3: payload.capacityM3,
        make: payload.make,
        model: payload.model,
        isActive: payload.isActive
      }
    });

    if (payload.driverId !== undefined) {
      if (payload.driverId) {
        await app.prisma.driver.update({
          where: { id: payload.driverId },
          data: { vehicleId: vehicle.id }
        });
      } else {
        await app.prisma.driver.updateMany({
          where: { vehicleId: vehicle.id, tenantId },
          data: { vehicleId: null }
        });
      }
    }

    reply.send(vehicle);
  });

  app.delete('/api/v1/fleet/vehicles/:id', { preHandler: [authenticate, requireRole([...FLEET_ROLES])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const { id } = request.params as { id: string };
    const existing = await app.prisma.vehicle.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Vehicle not found' });

    const vehicle = await app.prisma.vehicle.update({
      where: { id: existing.id },
      data: { isActive: false }
    });

    reply.send(vehicle);
  });

  app.get('/api/v1/fleet/drivers', { preHandler: [authenticate, requireRole([...FLEET_ROLES])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const drivers = await app.prisma.driver.findMany({
      where: { tenantId },
      include: {
        vehicle: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        routeStops: { where: { completedAt: null } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

    const result = await Promise.all(
      drivers.map(async (driver) => {
        const completedToday = await app.prisma.routeStop.count({
          where: {
            driverId: driver.id,
            completedAt: { gte: todayStart, lt: todayEnd }
          }
        });
        return {
          ...driver,
          todaysRouteStops: driver.routeStops.length,
          deliveriesCompletedToday: completedToday
        };
      })
    );

    reply.send({ drivers: result });
  });

  app.post('/api/v1/fleet/drivers', { preHandler: [authenticate, requireRole([...FLEET_ROLES])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const payload = request.body as { userId?: string; licenceNumber?: string; vehicleId?: string | null };
    if (!payload.userId) return reply.status(400).send({ error: 'userId is required' });

    const user = await app.prisma.user.findFirst({
      where: { id: payload.userId, tenantId, role: 'TENANT_DRIVER' }
    });
    if (!user) return reply.status(404).send({ error: 'TENANT_DRIVER user not found' });

    const driver = await app.prisma.driver.create({
      data: {
        tenantId,
        userId: payload.userId,
        licenceNumber: payload.licenceNumber,
        vehicleId: payload.vehicleId ?? null
      }
    });

    reply.status(201).send(driver);
  });

  app.patch('/api/v1/fleet/drivers/:id', { preHandler: [authenticate, requireRole([...FLEET_ROLES])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const { id } = request.params as { id: string };
    const payload = request.body as {
      vehicleId?: string | null;
      licenceNumber?: string;
      isAvailable?: boolean;
      licenceExpiry?: string | null;
    };

    const existing = await app.prisma.driver.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Driver not found' });

    const driver = await app.prisma.driver.update({
      where: { id: existing.id },
      data: {
        vehicleId: payload.vehicleId,
        licenceNumber: payload.licenceNumber,
        isAvailable: payload.isAvailable,
        licenceExpiry: payload.licenceExpiry ? new Date(payload.licenceExpiry) : undefined
      }
    });

    reply.send(driver);
  });
}

