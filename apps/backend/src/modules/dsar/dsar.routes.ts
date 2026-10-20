import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ComplianceExport, DSARRequest } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { DSAR_TYPES, dsarDueDate, hashDownloadToken } from '../../services/dsar.service.js';
import { exportStorageFor } from '../../services/export-storage.js';
import { recordAndPublishActivity } from '../../services/platform-activity.service.js';
import { notifyStaff } from '../../services/platform-notifier.service.js';

// Tenant side of trust.compliance (WP-2.5, L4): a tenant admin files a request for a data subject, follows its status
// and downloads the bundle once with the token Fauward sent (auth + token; only the token's hash is stored).

const createBody = z.object({
  requestType: z.enum(DSAR_TYPES).default('ACCESS'),
  subjectEmail: z.string().trim().toLowerCase().email('Enter the data subject’s email address.'),
  subjectName: z.string().trim().max(200).optional(),
  relation: z.enum(['CUSTOMER', 'EMPLOYEE', 'OTHER']).default('OTHER'),
  description: z.string().trim().min(10, 'Describe the request (at least 10 characters).').max(4000)
});
const downloadQuery = z.object({ token: z.string().min(20) });

const TENANT_STATUS: Record<string, string> = {
  RECEIVED: 'Received',
  IDENTITY_VERIFIED: 'In progress',
  GATHERING: 'In progress',
  DATA_GATHERED: 'In progress',
  APPROVED: 'In progress',
  ERASING: 'Erasing',
  DELIVERED: 'Ready to download',
  ERASED: 'Erased',
  CLOSED: 'Closed'
};

function tenantIdFrom(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function present(dsar: DSARRequest, exportRow: ComplianceExport | null, now = new Date()) {
  const downloadable = Boolean(exportRow?.downloadTokenHash && exportRow.expiresAt && exportRow.expiresAt > now && !exportRow.downloadedAt);
  return {
    id: dsar.id,
    requestType: dsar.requestType,
    subjectEmail: dsar.requesterEmail,
    status: dsar.status,
    statusLabel: TENANT_STATUS[dsar.status] ?? dsar.status,
    dueAt: dsar.dueAt.toISOString(),
    createdAt: dsar.createdAt.toISOString(),
    erasureCompletedAt: dsar.erasureCompletedAt?.toISOString() ?? null,
    download: exportRow?.downloadTokenHash || exportRow?.downloadedAt
      ? { available: downloadable, expiresAt: exportRow.expiresAt?.toISOString() ?? null, downloadedAt: exportRow.downloadedAt?.toISOString() ?? null }
      : null
  };
}

const adminOnly = { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] };

export async function registerDsarRoutes(app: FastifyInstance) {
  async function deliveredExports(tenantId: string, dsarIds: string[]) {
    if (dsarIds.length === 0) return new Map<string, ComplianceExport>();
    const rows = await app.prisma.complianceExport.findMany({
      where: { tenantId, dsarId: { in: dsarIds }, OR: [{ downloadTokenHash: { not: null } }, { downloadedAt: { not: null } }] },
      orderBy: { createdAt: 'desc' }
    });
    const latest = new Map<string, ComplianceExport>();
    for (const row of rows) if (row.dsarId && !latest.has(row.dsarId)) latest.set(row.dsarId, row);
    return latest;
  }

  app.get('/api/v1/tenants/me/dsar', adminOnly, async (request, reply) => {
    const tenantId = tenantIdFrom(request, reply);
    if (!tenantId) return;
    const requests = await app.prisma.dSARRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 });
    const exports = await deliveredExports(tenantId, requests.map((row) => row.id));
    return reply.send({ requests: requests.map((row) => present(row, exports.get(row.id) ?? null)) });
  });

  app.post('/api/v1/tenants/me/dsar', adminOnly, async (request, reply) => {
    const tenantId = tenantIdFrom(request, reply);
    if (!tenantId) return;
    const raw = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? (request.body as Record<string, unknown>) : {};
    // `requesterEmail` was the field name before WP-2.5.
    const parsed = createBody.safeParse({ ...raw, subjectEmail: raw.subjectEmail ?? raw.requesterEmail });
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: parsed.error.issues.map((issue) => issue.message).join(' ') });
    const input = parsed.data;
    const actorId = request.user?.sub ?? 'tenant_user';

    const dsar = await app.prisma.$transaction(async (tx) => {
      const created = await tx.dSARRequest.create({
        data: {
          tenantId,
          requesterEmail: input.subjectEmail,
          requestType: input.requestType,
          status: 'RECEIVED',
          notes: JSON.stringify({ subjectName: input.subjectName ?? null, relation: input.relation, description: input.description, submittedBy: actorId }),
          dueAt: dsarDueDate()
        }
      });
      await tx.dSARTransition.create({ data: { dsarId: created.id, fromStatus: null, toStatus: 'RECEIVED', actorId, notes: 'Tenant portal submission' } });
      return created;
    });

    const tenantName = request.tenant?.name ?? request.tenant?.slug ?? tenantId;
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: request.log },
      {
        service: 'trust.compliance',
        type: 'dsar.requested',
        tenantId,
        actorType: 'TENANT_USER',
        actorId: request.user?.sub ?? null,
        actorLabel: request.user?.email ?? 'Tenant admin',
        subjectType: 'dsar_request',
        subjectId: dsar.id,
        summary: `${tenantName} filed a ${dsar.requestType} request`,
        severity: dsar.requestType === 'ERASURE' ? 'ATTENTION' : 'INFO',
        consoleLink: `/trust/compliance/dsar/${dsar.id}`,
        dedupeKey: `dsar.requested:${dsar.id}`
      }
    );
    await notifyStaff(app, {
      permission: 'trust.compliance.dsar.read',
      event: 'dsar.requested',
      title: `New ${dsar.requestType} request`,
      body: `${tenantName}: due ${dsar.dueAt.toISOString().slice(0, 10)}`,
      link: `/trust/compliance/dsar/${dsar.id}`,
      tenantId
    });
    return reply.status(201).send(present(dsar, null));
  });

  app.get('/api/v1/tenants/me/dsar/:id', adminOnly, async (request, reply) => {
    const tenantId = tenantIdFrom(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const dsar = await app.prisma.dSARRequest.findFirst({ where: { id, tenantId }, include: { transitions: { orderBy: { createdAt: 'asc' } } } });
    if (!dsar) return reply.status(404).send({ error: 'DSAR request not found' });
    const exports = await deliveredExports(tenantId, [dsar.id]);
    return reply.send({
      ...present(dsar, exports.get(dsar.id) ?? null),
      history: dsar.transitions.map((row) => ({ status: TENANT_STATUS[row.toStatus] ?? row.toStatus, at: row.createdAt.toISOString() }))
    });
  });

  // One download per issued token: the hash is cleared in the same guarded update that records downloadedAt.
  app.get('/api/v1/tenants/me/dsar/:id/download', adminOnly, async (request, reply) => {
    const tenantId = tenantIdFrom(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const parsed = downloadQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(401).send({ error: 'TOKEN_REQUIRED', message: 'Open the download link Fauward sent you.' });
    const tokenHash = hashDownloadToken(parsed.data.token);
    const exportRow = await app.prisma.complianceExport.findFirst({ where: { tenantId, dsarId: id, downloadTokenHash: tokenHash } });
    if (!exportRow || !exportRow.s3Key) return reply.status(403).send({ error: 'TOKEN_INVALID', message: 'This download link is not valid or was already used.' });
    if (!exportRow.expiresAt || exportRow.expiresAt <= new Date()) return reply.status(410).send({ error: 'TOKEN_EXPIRED', message: 'This download link has expired. Ask Fauward to send a new one.' });
    const storage = exportStorageFor(app.prisma, exportRow.storageProvider);
    const bytes = storage ? await storage.get(tenantId, exportRow.s3Key) : null;
    if (!bytes) return reply.status(410).send({ error: 'EXPORT_GONE', message: 'The export is no longer stored. Ask Fauward to gather it again.' });
    const claimed = await app.prisma.complianceExport.updateMany({ where: { id: exportRow.id, tenantId, downloadTokenHash: tokenHash }, data: { downloadTokenHash: null, downloadedAt: new Date() } });
    if (claimed.count !== 1) return reply.status(403).send({ error: 'TOKEN_INVALID', message: 'This download link is not valid or was already used.' });
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: request.log },
      {
        service: 'trust.compliance',
        type: 'dsar.downloaded',
        tenantId,
        actorType: 'TENANT_USER',
        actorId: request.user?.sub ?? null,
        actorLabel: request.user?.email ?? 'Tenant admin',
        subjectType: 'dsar_request',
        subjectId: id,
        summary: `${request.tenant?.name ?? tenantId} downloaded a DSAR export`,
        consoleLink: `/trust/compliance/dsar/${id}`,
        dedupeKey: `dsar.downloaded:${exportRow.id}:${tokenHash.slice(0, 16)}`
      }
    );
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="dsar-${id}.json"`)
      .header('Cache-Control', 'no-store')
      .send(bytes);
  });
}
