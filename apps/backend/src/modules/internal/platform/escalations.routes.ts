import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Prisma, TrackingStatus } from '@prisma/client';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { EscalationError, escalationListQuery, escalationPatchBody, getEscalation, listEscalations, updateEscalation } from '../../../services/exception-escalation.service.js';
import { controlTowerService } from '../../control-tower/control-tower.service.js';
import { getPlatformTrackingView } from '../../tracking/tracking.service.js';

// platform.incidents (WP-2.11): tenant escalations (L15) and the cross-tenant operations views that used to live under
// /api/v1/platform/control-tower and /api/v1/platform/tracking on tenant JWTs (ACC-L15-2). Console requests run in
// system context; per-tenant queries name the tenant.

const readPre = [authenticatePlatformSession, requireConsolePermission('platform.incidents.read')];
const writePre = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('platform.incidents.write')];
const TERMINAL: TrackingStatus[] = ['DELIVERED', 'RETURNED', 'CANCELLED'];
const HOUR_MS = 60 * 60 * 1000;

const trackingListQuery = z.object({
  tenantId: z.string().min(1).optional(),
  status: z.string().optional(),
  hasException: z.enum(['true', 'false']).optional(),
  stuckHours: z.coerce.number().positive().max(24 * 90).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});
const stuckQuery = z.object({ hours: z.coerce.number().positive().max(24 * 90).default(24), tenantId: z.string().min(1).optional() });

function sendEscalationError(reply: FastifyReply, error: unknown) {
  if (error instanceof EscalationError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

const snapshotInclude = {
  tenant: { select: { id: true, name: true, slug: true, status: true } },
  shipment: { select: { trackingNumber: true, status: true } }
} satisfies Prisma.TrackingSnapshotInclude;

export async function registerConsoleEscalationRoutes(app: FastifyInstance) {
  // ── Escalations (L15) ──────────────────────────────────────────────────────
  app.get('/api/internal/operations/escalations', { preHandler: readPre }, async (request, reply) => {
    const parsed = escalationListQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    return reply.send(await listEscalations(app, parsed.data, request.platform!.user.id));
  });

  app.get('/api/internal/operations/escalations/:id', { preHandler: readPre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const escalation = await getEscalation(app, id);
    if (!escalation) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Escalation not found' });
    return reply.send(escalation);
  });

  app.patch('/api/internal/operations/escalations/:id', { preHandler: writePre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = escalationPatchBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    try {
      return reply.send(await updateEscalation(app, request, id, parsed.data));
    } catch (error) {
      return sendEscalationError(reply, error);
    }
  });

  // ── Control tower (moved from /api/v1/platform/control-tower) ──────────────
  app.get('/api/internal/operations/control-tower/health', { preHandler: readPre }, async (_request, reply) => {
    return reply.send({ metrics: await controlTowerService.metrics(app.prisma) });
  });

  app.get('/api/internal/operations/control-tower/tenants/:tenantId/health', { preHandler: readPre }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    return reply.send(await controlTowerService.tenantHealth(app.prisma, tenant.id));
  });

  // ── Cross-tenant tracking (moved from /api/v1/platform/tracking) ───────────
  app.get('/api/internal/operations/tracking', { preHandler: readPre }, async (request, reply) => {
    const parsed = trackingListQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const query = parsed.data;
    const statusFilter = query.status ? (query.status.split(',').map((status) => status.trim()) as TrackingStatus[]) : undefined;
    const where: Prisma.TrackingSnapshotWhereInput = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(statusFilter ? { currentStatus: { in: statusFilter } } : {}),
      ...(query.hasException === 'true' ? { hasException: true } : {}),
      ...(query.stuckHours ? { lastEventAt: { lt: new Date(Date.now() - query.stuckHours * HOUR_MS) } } : {})
    };
    const [snapshots, total] = await Promise.all([
      app.prisma.trackingSnapshot.findMany({ where, include: snapshotInclude, orderBy: { updatedAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      app.prisma.trackingSnapshot.count({ where })
    ]);
    return reply.send({ data: snapshots, meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
  });

  app.get('/api/internal/operations/tracking/exceptions', { preHandler: readPre }, async (_request, reply) => {
    const snapshots = await app.prisma.trackingSnapshot.findMany({ where: { hasException: true }, include: snapshotInclude, orderBy: { updatedAt: 'desc' }, take: 200 });
    return reply.send({ data: snapshots });
  });

  app.get('/api/internal/operations/tracking/stuck', { preHandler: readPre }, async (request, reply) => {
    const parsed = stuckQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const stuck = await app.prisma.trackingSnapshot.findMany({
      where: { lastEventAt: { lt: new Date(Date.now() - parsed.data.hours * HOUR_MS) }, currentStatus: { notIn: TERMINAL }, ...(parsed.data.tenantId ? { tenantId: parsed.data.tenantId } : {}) },
      include: snapshotInclude,
      orderBy: { lastEventAt: 'asc' },
      take: 200
    });
    return reply.send({ data: stuck, thresholdHours: parsed.data.hours });
  });

  app.get('/api/internal/operations/tracking/health', { preHandler: readPre }, async (_request, reply) => {
    const [total, exceptions, stuck, delivered] = await Promise.all([
      app.prisma.trackingSnapshot.count(),
      app.prisma.trackingSnapshot.count({ where: { hasException: true } }),
      app.prisma.trackingSnapshot.count({ where: { lastEventAt: { lt: new Date(Date.now() - 24 * HOUR_MS) }, currentStatus: { notIn: TERMINAL } } }),
      app.prisma.trackingSnapshot.count({ where: { currentStatus: 'DELIVERED' } })
    ]);
    return reply.send({ total, exceptions, stuck, delivered, activeShipments: total - delivered });
  });

  app.get('/api/internal/operations/tracking/tenants/:tenantId/shipments/:shipmentId', { preHandler: readPre }, async (request, reply) => {
    const { tenantId, shipmentId } = request.params as { tenantId: string; shipmentId: string };
    const view = await getPlatformTrackingView(app.prisma, tenantId, shipmentId);
    if (!view) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Shipment not found' });
    return reply.send(view);
  });
}
