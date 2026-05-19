import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { getHotState } from './realtime/hot-state.repository.js';
import { ingestTrackingPoints, ingestManualAction } from './realtime/ingest.service.js';
import { findBreadcrumbs } from './history/history.repository.js';
import { resolveEscalation } from './escalation/resolve.service.js';
import { writeInternalAudit } from '../internal/internal-audit.js';

const FIELD_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF', 'TENANT_DRIVER'] as const;

function tenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const id = request.tenant?.id;
  if (!id) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return id;
}

export async function registerRealtimeTrackingRoutes(app: FastifyInstance) {
  // Driver ingest endpoint
  app.post(
    '/api/v1/tracking/ingest',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole([...FIELD_ROLES])] },
    async (request, reply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;

      const body = request.body as {
        shipmentId: string;
        idempotencyKey: string;
        points: Array<{ lat: number; lng: number; accuracy?: number; ts: string; status?: string }>;
      };

      if (!body.shipmentId || !body.idempotencyKey || !body.points?.length) {
        return reply.status(400).send({ error: 'shipmentId, idempotencyKey, and points are required' });
      }

      const result = await ingestTrackingPoints(app, {
        tenantId: tid,
        shipmentId: body.shipmentId,
        idempotencyKey: body.idempotencyKey,
        points: body.points,
        source: 'driver',
        sourceRef: request.user?.sub,
        driverId: request.user?.sub,
      });

      return reply.status(201).send(result);
    }
  );

  // Webhook stub (carrier adapters deferred)
  app.post(
    '/api/v1/tracking/webhook/:carrier',
    async (request, reply) => {
      const { carrier } = request.params as { carrier: string };
      const signature = request.headers['x-webhook-signature'] as string | undefined;

      if (!signature) {
        return reply.status(400).send({ error: 'Missing signature' });
      }

      // TODO: verify HMAC per carrier secret (deferred to carrier adapter phase)
      // For now, accept all signed webhooks with a vague error on failure
      const body = request.body as Record<string, unknown>;
      app.log.info({ carrier, body }, 'Webhook received');

      return reply.status(200).send({ accepted: true });
    }
  );

  // Manual action endpoint
  app.post(
    '/api/v1/tracking/manual',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'])] },
    async (request, reply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;

      const body = request.body as {
        shipmentId: string;
        action: 'status' | 'flag' | 'unflag';
        status?: string;
        reason?: string;
        idempotencyKey: string;
      };

      if (!body.shipmentId || !body.action || !body.idempotencyKey) {
        return reply.status(400).send({ error: 'shipmentId, action, and idempotencyKey are required' });
      }

      const result = await ingestManualAction(app, {
        tenantId: tid,
        shipmentId: body.shipmentId,
        action: body.action,
        status: body.status,
        reason: body.reason,
        idempotencyKey: body.idempotencyKey,
        actorId: request.user?.sub,
      });

      return reply.status(200).send(result);
    }
  );

  // Hot state read
  app.get(
    '/api/v1/tracking/:shipmentId/state',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request, reply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };

      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId: tid },
        select: { id: true, trackingNumber: true }
      });
      if (!shipment) {
        return reply.status(404).send({ error: 'Shipment not found' });
      }

      const hotState = await getHotState(app.redis, tid, shipmentId);
      const stalenessSeconds = hotState?.lastSeenAt
        ? Math.floor((Date.now() - new Date(hotState.lastSeenAt).getTime()) / 1000)
        : null;

      return reply.send({
        shipmentId,
        trackingNumber: shipment.trackingNumber,
        state: hotState,
        stalenessSeconds,
      });
    }
  );

  // History endpoint
  app.get(
    '/api/v1/tracking/:shipmentId/history',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request, reply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };
      const query = request.query as { since?: string; limit?: string };

      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId: tid },
        select: { id: true }
      });
      if (!shipment) {
        return reply.status(404).send({ error: 'Shipment not found' });
      }

      const breadcrumbs = await findBreadcrumbs(app.prisma, tid, shipmentId, {
        since: query.since ? new Date(query.since) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
      });

      return reply.send({ data: breadcrumbs });
    }
  );

  // Admin escalations list
  app.get(
    '/api/v1/admin/escalations',
    { preHandler: [app.authenticate, requireRole(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const query = request.query as {
        status?: string;
        severity?: string;
        limit?: string;
        cursor?: string;
      };

      const limit = Math.min(50, Math.max(1, Number(query.limit ?? 50)));
      const cursor = query.cursor ? new Date(query.cursor) : undefined;

      const where: Record<string, unknown> = {
        escalationFlag: true,
      };

      if (cursor) {
        (where as any).escalationFlaggedAt = { lt: cursor };
      }

      const [shipments, total] = await Promise.all([
        app.prisma.shipment.findMany({
          where,
          include: {
            tenant: { select: { id: true, name: true, slug: true } },
          },
          orderBy: { escalationFlaggedAt: 'desc' },
          take: limit,
        }),
        app.prisma.shipment.count({ where }),
      ]);

      await writeInternalAudit(request, 'ADMIN_ESCALATIONS_LIST', 'SHIPMENT', 'list', null, null, null);

      const lastShipment = shipments[shipments.length - 1];
      const nextCursor = shipments.length === limit && lastShipment?.escalationFlaggedAt
        ? lastShipment.escalationFlaggedAt.toISOString()
        : null;

      return reply.send({
        data: shipments,
        meta: { limit, total, nextCursor },
      });
    }
  );

  // Resolve escalation
  app.post(
    '/api/v1/tracking/:shipmentId/escalation/resolve',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER', 'SUPER_ADMIN'])] },
    async (request, reply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };
      const body = request.body as { note?: string };

      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId: tid },
        select: { id: true, trackingNumber: true, escalationFlag: true }
      });
      if (!shipment) {
        return reply.status(404).send({ error: 'Shipment not found' });
      }
      if (!shipment.escalationFlag) {
        return reply.status(409).send({ error: 'Shipment is not escalated' });
      }

      await resolveEscalation(app.prisma, app.redis, {
        tenantId: tid,
        shipmentId,
        trackingNumber: shipment.trackingNumber,
        note: body.note ?? '',
        resolvedBy: request.user?.sub,
      });

      return reply.send({ resolved: true });
    }
  );
}
