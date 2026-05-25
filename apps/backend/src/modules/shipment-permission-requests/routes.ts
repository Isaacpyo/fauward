import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { notifyManagersOfRequest, notifyRequester } from './notifier.js';

const SCAN_ROLES = ['TENANT_DRIVER', 'TENANT_STAFF', 'TENANT_MANAGER', 'TENANT_ADMIN'];
const REQUESTER_ROLES = ['TENANT_DRIVER'];
const APPROVER_ROLES = ['TENANT_MANAGER', 'TENANT_ADMIN'];

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function fullName(user: { firstName: string | null; lastName: string | null; email: string }): string {
  const parts = [user.firstName, user.lastName].filter((v): v is string => Boolean(v?.trim()));
  return parts.length > 0 ? parts.join(' ') : user.email;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function recipientNameFromAddress(value: unknown): string | null {
  const json = asRecord(value);
  const name = json?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

async function loadShipmentSummary(app: FastifyInstance, tenantId: string, trackingNumber: string) {
  return app.prisma.shipment.findFirst({
    where: { tenantId, trackingNumber },
    select: {
      id: true,
      trackingNumber: true,
      status: true,
      assignedDriverId: true,
      destinationAddress: true,
      driver: {
        select: {
          id: true,
          userId: true,
          user: { select: { firstName: true, lastName: true, email: true } }
        }
      },
      routeStops: {
        select: { id: true, sequence: true, type: true, completedAt: true },
        orderBy: { sequence: 'asc' }
      }
    }
  });
}

type ShipmentSummaryRow = NonNullable<Awaited<ReturnType<typeof loadShipmentSummary>>>;

function pickCurrentStop(stops: ShipmentSummaryRow['routeStops']) {
  const next = stops.find((s) => !s.completedAt);
  return next ?? stops[stops.length - 1] ?? null;
}

const LookupBody = z.object({
  trackingNumber: z.string().min(1).max(64)
});

const CreateBody = z.object({
  shipmentId: z.string().min(1),
  note: z.string().max(500).optional()
});

const RejectBody = z.object({
  reason: z.string().max(500).optional()
});

export async function registerShipmentPermissionRoutes(app: FastifyInstance) {
  // ─── Scan lookup ───────────────────────────────────────────────────────────
  app.post(
    '/api/v1/field/scan/lookup',
    { preHandler: [authenticate, requireRole(SCAN_ROLES)] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      const userId = request.user?.sub;
      if (!tenantId) return;
      if (!userId) throw app.httpErrors.unauthorized();

      const parsed = LookupBody.safeParse(request.body);
      if (!parsed.success) throw app.httpErrors.badRequest('trackingNumber required');

      const trackingNumber = parsed.data.trackingNumber.trim().toUpperCase();
      const shipment = await loadShipmentSummary(app, tenantId, trackingNumber);
      if (!shipment) throw app.httpErrors.notFound('No shipment matches this code');

      const myDriver = await app.prisma.driver.findFirst({
        where: { tenantId, userId },
        select: { id: true }
      });
      const isAssignedToMe = Boolean(myDriver && shipment.assignedDriverId === myDriver.id);

      const currentStop = pickCurrentStop(shipment.routeStops);
      const assignedDriver = shipment.driver
        ? { id: shipment.driver.id, name: fullName(shipment.driver.user) }
        : null;

      // Surface existing pending request from this user, if any, so the UI
      // can avoid duplicates.
      const existingRequest = await app.prisma.shipmentPermissionRequest.findFirst({
        where: {
          tenantId,
          shipmentId: shipment.id,
          requestedByUserId: userId,
          status: 'PENDING'
        },
        select: { id: true, createdAt: true }
      });

      return reply.send({
        shipment: {
          id: shipment.id,
          trackingNumber: shipment.trackingNumber,
          status: shipment.status,
          recipientName: recipientNameFromAddress(shipment.destinationAddress),
          currentStop: currentStop
            ? { id: currentStop.id, sequence: currentStop.sequence, type: currentStop.type }
            : null,
          assignedDriver,
          isAssignedToMe
        },
        existingRequest
      });
    }
  );

  // ─── Create permission request ─────────────────────────────────────────────
  app.post(
    '/api/v1/field/permission-requests',
    { preHandler: [authenticate, requireRole(REQUESTER_ROLES)] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      const userId = request.user?.sub;
      if (!tenantId) return;
      if (!userId) throw app.httpErrors.unauthorized();

      const parsed = CreateBody.safeParse(request.body);
      if (!parsed.success) throw app.httpErrors.badRequest('shipmentId required');

      const { shipmentId, note } = parsed.data;

      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId },
        select: {
          id: true,
          trackingNumber: true,
          status: true,
          assignedDriverId: true,
          driver: {
            select: {
              id: true,
              userId: true,
              user: { select: { firstName: true, lastName: true, email: true } }
            }
          }
        }
      });
      if (!shipment) throw app.httpErrors.notFound('Shipment not found');

      const myDriver = await app.prisma.driver.findFirst({
        where: { tenantId, userId },
        select: { id: true }
      });
      if (!myDriver) {
        throw app.httpErrors.forbidden('Only registered drivers can request shipment permissions');
      }
      if (shipment.assignedDriverId === myDriver.id) {
        throw app.httpErrors.conflict('Shipment is already assigned to you');
      }

      const duplicate = await app.prisma.shipmentPermissionRequest.findFirst({
        where: { tenantId, shipmentId, requestedByUserId: userId, status: 'PENDING' },
        select: { id: true }
      });
      if (duplicate) {
        throw app.httpErrors.conflict('You already have a pending request for this shipment');
      }

      const me = await app.prisma.user.findFirst({
        where: { id: userId, tenantId },
        select: { firstName: true, lastName: true, email: true }
      });

      const created = await app.prisma.shipmentPermissionRequest.create({
        data: {
          tenantId,
          shipmentId,
          requestedByUserId: userId,
          requestedAction: 'reassign_driver',
          status: 'PENDING',
          note: note ?? null
        },
        select: { id: true, status: true, createdAt: true }
      });

      request.log.info(
        { tenantId, shipmentId, requestId: created.id, requestedBy: userId },
        'shipment permission requested'
      );

      await notifyManagersOfRequest(app, {
        tenantId,
        requestId: created.id,
        trackingNumber: shipment.trackingNumber,
        shipmentStatus: shipment.status,
        requesterName: me ? fullName(me) : 'A driver',
        currentDriverName: shipment.driver ? fullName(shipment.driver.user) : null,
        note: note ?? null
      });

      return reply.status(201).send({ request: created });
    }
  );

  // ─── List permission requests (approver dashboard) ─────────────────────────
  app.get(
    '/api/v1/permission-requests',
    { preHandler: [authenticate, requireRole(APPROVER_ROLES)] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const { status = 'PENDING', limit = '50' } = request.query as { status?: string; limit?: string };
      const take = Math.max(1, Math.min(100, Number(limit) || 50));

      const rows = await app.prisma.shipmentPermissionRequest.findMany({
        where: { tenantId, status },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          status: true,
          note: true,
          requestedAction: true,
          createdAt: true,
          respondedAt: true,
          shipmentId: true,
          requestedByUserId: true,
          shipment: {
            select: {
              trackingNumber: true,
              status: true,
              destinationAddress: true,
              driver: {
                select: {
                  id: true,
                  user: { select: { firstName: true, lastName: true, email: true } }
                }
              }
            }
          }
        }
      });

      const userIds = Array.from(new Set(rows.map((r) => r.requestedByUserId)));
      const requesters = userIds.length
        ? await app.prisma.user.findMany({
            where: { id: { in: userIds }, tenantId },
            select: { id: true, firstName: true, lastName: true, email: true, role: true }
          })
        : [];
      const requesterById = new Map(requesters.map((u) => [u.id, u]));

      return reply.send({
        requests: rows.map((row) => {
          const requester = requesterById.get(row.requestedByUserId);
          return {
            id: row.id,
            status: row.status,
            note: row.note,
            requestedAction: row.requestedAction,
            createdAt: row.createdAt.toISOString(),
            respondedAt: row.respondedAt?.toISOString() ?? null,
            shipment: {
              id: row.shipmentId,
              trackingNumber: row.shipment.trackingNumber,
              status: row.shipment.status,
              recipientName: recipientNameFromAddress(row.shipment.destinationAddress),
              currentDriver: row.shipment.driver
                ? { id: row.shipment.driver.id, name: fullName(row.shipment.driver.user) }
                : null
            },
            requester: requester
              ? { id: requester.id, name: fullName(requester), role: requester.role }
              : { id: row.requestedByUserId, name: 'Unknown', role: null }
          };
        })
      });
    }
  );

  // ─── Approve ───────────────────────────────────────────────────────────────
  app.post(
    '/api/v1/permission-requests/:id/approve',
    { preHandler: [authenticate, requireRole(APPROVER_ROLES)] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      const approverId = request.user?.sub;
      if (!tenantId) return;
      if (!approverId) throw app.httpErrors.unauthorized();

      const { id } = request.params as { id: string };

      const existing = await app.prisma.shipmentPermissionRequest.findFirst({
        where: { id, tenantId },
        select: {
          id: true,
          status: true,
          shipmentId: true,
          requestedByUserId: true
        }
      });
      if (!existing) throw app.httpErrors.notFound('Request not found');
      if (existing.status !== 'PENDING') {
        throw app.httpErrors.conflict(`Request already ${existing.status.toLowerCase()}`);
      }

      const requesterDriver = await app.prisma.driver.findFirst({
        where: { tenantId, userId: existing.requestedByUserId },
        select: { id: true }
      });
      if (!requesterDriver) {
        throw app.httpErrors.unprocessableEntity('Requester is no longer an active driver');
      }

      const result = await app.prisma.$transaction(async (tx) => {
        const locked = await tx.shipmentPermissionRequest.findFirst({
          where: { id, tenantId, status: 'PENDING' },
          select: { id: true }
        });
        if (!locked) {
          throw app.httpErrors.conflict('Request was already handled');
        }

        await tx.shipment.update({
          where: { id: existing.shipmentId },
          data: { assignedDriverId: requesterDriver.id }
        });

        await tx.shipmentEvent.create({
          data: {
            tenantId,
            shipmentId: existing.shipmentId,
            status: 'DRIVER_REASSIGNED',
            actorId: approverId,
            actorType: 'USER',
            source: 'MANUAL',
            notes: `Reassigned via permission request ${id}`
          }
        });

        return tx.shipmentPermissionRequest.update({
          where: { id },
          data: {
            status: 'APPROVED',
            respondedByUserId: approverId,
            respondedAt: new Date()
          },
          select: { id: true, status: true, respondedAt: true }
        });
      });

      const shipment = await app.prisma.shipment.findUnique({
        where: { id: existing.shipmentId },
        select: { trackingNumber: true }
      });

      await notifyRequester(app, {
        tenantId,
        requestId: id,
        requesterUserId: existing.requestedByUserId,
        decision: 'APPROVED',
        trackingNumber: shipment?.trackingNumber ?? ''
      });

      request.log.info(
        { tenantId, requestId: id, shipmentId: existing.shipmentId, approverId },
        'shipment permission approved'
      );

      return reply.send({ request: result });
    }
  );

  // ─── Reject ────────────────────────────────────────────────────────────────
  app.post(
    '/api/v1/permission-requests/:id/reject',
    { preHandler: [authenticate, requireRole(APPROVER_ROLES)] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      const approverId = request.user?.sub;
      if (!tenantId) return;
      if (!approverId) throw app.httpErrors.unauthorized();

      const { id } = request.params as { id: string };
      const parsed = RejectBody.safeParse(request.body ?? {});
      if (!parsed.success) throw app.httpErrors.badRequest('Invalid body');

      const existing = await app.prisma.shipmentPermissionRequest.findFirst({
        where: { id, tenantId },
        select: { id: true, status: true, shipmentId: true, requestedByUserId: true }
      });
      if (!existing) throw app.httpErrors.notFound('Request not found');
      if (existing.status !== 'PENDING') {
        throw app.httpErrors.conflict(`Request already ${existing.status.toLowerCase()}`);
      }

      // Rejection reason is conveyed to the requester via the in-app
      // notification body; the original `note` field is preserved so we keep
      // the requester's stated intent for audit.
      const updated = await app.prisma.shipmentPermissionRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          respondedByUserId: approverId,
          respondedAt: new Date()
        },
        select: { id: true, status: true, respondedAt: true }
      });

      const shipment = await app.prisma.shipment.findUnique({
        where: { id: existing.shipmentId },
        select: { trackingNumber: true }
      });

      await notifyRequester(app, {
        tenantId,
        requestId: id,
        requesterUserId: existing.requestedByUserId,
        decision: 'REJECTED',
        trackingNumber: shipment?.trackingNumber ?? '',
        reason: parsed.data.reason ?? null
      });

      return reply.send({ request: updated });
    }
  );

  // ─── Cancel (requester only) ───────────────────────────────────────────────
  app.post(
    '/api/v1/permission-requests/:id/cancel',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      const userId = request.user?.sub;
      if (!tenantId) return;
      if (!userId) throw app.httpErrors.unauthorized();

      const { id } = request.params as { id: string };
      const existing = await app.prisma.shipmentPermissionRequest.findFirst({
        where: { id, tenantId },
        select: { id: true, status: true, requestedByUserId: true }
      });
      if (!existing) throw app.httpErrors.notFound('Request not found');
      if (existing.requestedByUserId !== userId) {
        throw app.httpErrors.forbidden('You can only cancel your own requests');
      }
      if (existing.status !== 'PENDING') {
        throw app.httpErrors.conflict(`Request already ${existing.status.toLowerCase()}`);
      }

      const updated = await app.prisma.shipmentPermissionRequest.update({
        where: { id },
        data: { status: 'CANCELLED', respondedAt: new Date() },
        select: { id: true, status: true }
      });

      return reply.send({ request: updated });
    }
  );
}
