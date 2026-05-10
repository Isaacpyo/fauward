import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TrackingSource, TrackingActorType, TrackingVisibility, type TrackingStatus } from '@fauward/tracking-core';
import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { getTenantTrackingView, recordTrackingEvent } from './tracking.service.js';
import { buildStatusTitle, statusToEventType } from './tracking-event.service.js';
import { getAllowedNextStatuses } from './tracking-policy.service.js';
import { trackingAiService } from './tracking.ai.service.js';

function tenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const id = request.tenant?.id;
  if (!id) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return id;
}

export async function registerTenantTrackingRoutes(app: FastifyInstance) {
  // List shipments with tracking summary
  app.get(
    '/api/v1/tenant/tracking',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;

      const query = request.query as {
        status?: string;
        hasException?: string;
        page?: string;
        limit?: string;
      };

      const page = Math.max(1, Number(query.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
      const skip = (page - 1) * limit;

      const statusFilter = query.status ? query.status.split(',').map((s) => s.trim()) : undefined;

      const [snapshots, total] = await Promise.all([
        app.prisma.trackingSnapshot.findMany({
          where: {
            tenantId: tid,
            ...(statusFilter ? { currentStatus: { in: statusFilter as never[] } } : {}),
            ...(query.hasException === 'true' ? { hasException: true } : {})
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit
        }),
        app.prisma.trackingSnapshot.count({
          where: {
            tenantId: tid,
            ...(statusFilter ? { currentStatus: { in: statusFilter as never[] } } : {}),
            ...(query.hasException === 'true' ? { hasException: true } : {})
          }
        })
      ]);

      return reply.send({
        data: snapshots,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    }
  );

  // Full tracking detail for a shipment
  app.get(
    '/api/v1/tenant/shipments/:shipmentId/tracking',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };

      const view = await getTenantTrackingView(app.prisma, shipmentId, tid);
      if (!view) return reply.status(404).send({ error: 'Shipment not found' });

      const snapshot = view.snapshot;
      const allowedNextStatuses = snapshot
        ? getAllowedNextStatuses(snapshot.currentStatus as TrackingStatus)
        : [];

      return reply.send({ ...view, allowedNextStatuses });
    }
  );

  app.get(
    '/api/v1/tenant/shipments/:shipmentId/tracking/ai-summary',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };
      const summary = await trackingAiService.getCustomerSummary(app.prisma, shipmentId, tid);
      if (!summary) return reply.status(404).send({ error: 'Shipment tracking not found' });
      reply.send(summary);
    }
  );

  app.get(
    '/api/v1/tenant/shipments/:shipmentId/tracking/exception-diagnosis',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };
      const diagnosis = await trackingAiService.diagnoseException(app.prisma, shipmentId, tid);
      if (!diagnosis) return reply.status(404).send({ error: 'Shipment tracking not found' });
      reply.send(diagnosis);
    }
  );

  // Create a manual tracking event
  app.post(
    '/api/v1/tenant/shipments/:shipmentId/tracking/events',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };

      const body = request.body as {
        status: TrackingStatus;
        title?: string;
        description?: string;
        locationName?: string;
        city?: string;
        country?: string;
        lat?: number;
        lng?: number;
        visibility?: TrackingVisibility;
        overrideReason?: string;
        occurredAt?: string;
      };

      if (!body.status) {
        return reply.status(400).send({ error: 'status is required' });
      }

      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId: tid },
        select: { id: true, trackingNumber: true }
      });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      try {
        const eventId = await recordTrackingEvent(app, {
          tenantId: tid,
          shipmentId: shipment.id,
          trackingNumber: shipment.trackingNumber,
          eventType: statusToEventType(body.status),
          status: body.status,
          title: body.title ?? buildStatusTitle(body.status),
          description: body.description,
          source: TrackingSource.TENANT_PORTAL,
          actorType: TrackingActorType.TENANT_USER,
          actorId: request.user?.sub,
          visibility: body.visibility ?? TrackingVisibility.CUSTOMER_VISIBLE,
          locationName: body.locationName,
          city: body.city,
          country: body.country,
          lat: body.lat,
          lng: body.lng,
          overrideReason: body.overrideReason,
          occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
          plan: request.tenant?.plan
        });

        return reply.status(201).send({ eventId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create tracking event';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // POD for a shipment
  app.get(
    '/api/v1/tenant/shipments/:shipmentId/pod',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };

      const [pod, legacyPod, shipment] = await Promise.all([
        app.prisma.proofOfDelivery.findFirst({
          where: { shipmentId, tenantId: tid }
        }),
        app.prisma.podAsset.findMany({
          where: { shipmentId }
        }),
        app.prisma.shipment.findFirst({
          where: { id: shipmentId, tenantId: tid },
          include: { driver: { include: { user: true } } }
        })
      ]);

      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      return reply.send({
        proofOfDelivery: pod,
        legacyPodAssets: legacyPod,
        capturedBy: shipment.driver
          ? [shipment.driver.user.firstName, shipment.driver.user.lastName].filter(Boolean).join(' ')
          : null,
        deliveredAt: shipment.actualDelivery
      });
    }
  );
}
