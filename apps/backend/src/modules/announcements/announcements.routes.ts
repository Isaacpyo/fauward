import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, type PlatformAnnouncement } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { dangerous } from '../../middleware/dangerous.js';
import { writePlatformAuditLog } from '../../services/platform-audit.service.js';
import { recordAndPublishActivity, staffActor } from '../../services/platform-activity.service.js';
import { platformAuditActor, reasonOf } from '../internal/request-meta.js';
import {
  RECEIPT_ACTIONS,
  announcementCreateBody,
  announcementPatchBody,
  announcementState,
  audienceCounts,
  audienceQuery,
  emailAnnouncement,
  parseAudienceQuery,
  receiptSummaries,
  stateWhere,
  visibleToTenantWhere
} from '../../services/announcement.service.js';

// customer.comms announcements (L8, WP-2.14). Tenants read the announcements targeted at them (archived/expired/
// dismissed ones disappear) and report receipts; the console publishes, edits, archives and deletes them and sees
// receipts and audience counts.

const readPre = [authenticatePlatformSession, requireConsolePermission('customer.comms.read')];
const writePre = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('customer.comms.send')];
const listQuery = z.object({ status: z.enum(['active', 'scheduled', 'expired', 'archived', 'all']).default('active') });
const receiptBody = z.object({ action: z.enum(RECEIPT_ACTIONS) });

function present(row: PlatformAnnouncement) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    targetAll: row.targetAll,
    tenantIds: row.tenantIds,
    planTiers: row.planTiers,
    cta: row.cta,
    dismissible: row.dismissible,
    publishedAt: row.publishedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    alsoEmail: row.alsoEmail,
    createdBy: row.createdBy,
    state: announcementState(row)
  };
}

function activityDeps(app: FastifyInstance) {
  return { prisma: app.prisma, redis: app.redis, log: app.log };
}

export async function registerAnnouncementRoutes(app: FastifyInstance) {
  // ── Tenant ─────────────────────────────────────────────────────────────────
  app.get('/api/v1/tenant/announcements', { preHandler: [authenticate] }, tenantAnnouncementsHandler);
  app.get('/api/v1/tenants/me/announcements', { preHandler: [authenticate] }, tenantAnnouncementsHandler);

  async function tenantAnnouncementsHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenant = request.tenant;
    if (!tenant) return reply.status(400).send({ error: 'Tenant context required' });
    const userId = request.apiKey ? null : request.user?.sub ?? null;
    const announcements = await app.prisma.platformAnnouncement.findMany({
      where: {
        ...visibleToTenantWhere(tenant),
        // A user's dismissal hides the announcement on every device.
        ...(userId ? { receipts: { none: { userId, tenantId: tenant.id, dismissedAt: { not: null } } } } : {})
      },
      orderBy: { publishedAt: 'desc' },
      take: 20
    });
    reply.send({ announcements: announcements.map(({ id, type, title, body, cta, dismissible, publishedAt, expiresAt }) => ({ id, type, title, body, cta, dismissible, publishedAt, expiresAt })) });
  }

  app.post('/api/v1/tenants/me/announcements/:id/receipt', { preHandler: [authenticate] }, async (request, reply) => {
    const tenant = request.tenant;
    if (!tenant) return reply.status(400).send({ error: 'Tenant context required' });
    const parsed = receiptBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: 'action must be VIEWED, DISMISSED or CTA_CLICKED' });
    // Receipts are people: API keys and Fauward staff in an impersonated session do not count.
    if (request.apiKey || !request.user || request.user.impersonator) return reply.status(204).send();
    const { id } = request.params as { id: string };
    const announcement = await app.prisma.platformAnnouncement.findFirst({ where: { id, ...visibleToTenantWhere(tenant) } });
    if (!announcement) return reply.status(404).send({ error: 'Announcement not found' });
    const userId = request.user.sub;
    const now = new Date();
    const existing = await app.prisma.announcementReceipt.findUnique({ where: { announcementId_userId: { announcementId: announcement.id, userId } } });
    // Each action is stamped once (the first time); later reports of the same action change nothing.
    const stamp = {
      ...(parsed.data.action === 'DISMISSED' && !existing?.dismissedAt ? { dismissedAt: now } : {}),
      ...(parsed.data.action === 'CTA_CLICKED' && !existing?.ctaClickedAt ? { ctaClickedAt: now } : {})
    };
    if (!existing) {
      await app.prisma.announcementReceipt.create({ data: { announcementId: announcement.id, tenantId: tenant.id, userId, viewedAt: now, ...stamp } });
    } else if (Object.keys(stamp).length > 0) {
      await app.prisma.announcementReceipt.update({ where: { id: existing.id }, data: stamp });
    }
    return reply.status(204).send();
  });

  // ── Console ────────────────────────────────────────────────────────────────
  app.get('/api/internal/announcements', { preHandler: readPre }, async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const rows = await app.prisma.platformAnnouncement.findMany({ where: stateWhere(parsed.data.status), orderBy: { publishedAt: 'desc' }, take: 100 });
    const summaries = await receiptSummaries(app, rows.map((row) => row.id));
    return reply.send({ data: rows.map((row) => ({ ...present(row), receipts: summaries.get(row.id) })) });
  });

  app.get('/api/internal/announcements/audience-preview', { preHandler: readPre }, async (request, reply) => {
    const parsed = audienceQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    return reply.send(await audienceCounts(app, parseAudienceQuery(parsed.data)));
  });

  app.get('/api/internal/announcements/:id', { preHandler: readPre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await app.prisma.platformAnnouncement.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Announcement not found' });
    const [summaries, audience] = await Promise.all([receiptSummaries(app, [row.id]), audienceCounts(app, row)]);
    return reply.send({ ...present(row), receipts: summaries.get(row.id), audience });
  });

  app.post('/api/internal/announcements', { preHandler: writePre }, async (request, reply) => {
    const parsed = announcementCreateBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: parsed.error.issues[0]?.message });
    const body = parsed.data;
    const created = await app.prisma.platformAnnouncement.create({
      data: {
        type: body.type,
        title: body.title,
        body: body.body,
        targetAll: body.targetAll,
        tenantIds: body.targetAll ? [] : body.tenantIds,
        planTiers: body.targetAll ? [] : body.planTiers,
        ...(body.cta ? { cta: body.cta } : {}),
        dismissible: body.dismissible,
        ...(body.publishedAt ? { publishedAt: new Date(body.publishedAt) } : {}),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        alsoEmail: body.alsoEmail,
        createdBy: request.platform!.user.id
      }
    });
    const audience = await audienceCounts(app, created);
    await writePlatformAuditLog(app.prisma, { ...platformAuditActor(request), actorType: 'PLATFORM_USER', action: 'ANNOUNCEMENT_PUBLISHED', targetTenantId: null, reason: null, metadata: { announcementId: created.id, audience } });
    await recordAndPublishActivity(activityDeps(app), {
      service: 'customer.comms',
      type: 'announcement.published',
      ...staffActor(request),
      subjectType: 'announcement',
      subjectId: created.id,
      summary: `${announcementState(created) === 'SCHEDULED' ? 'Scheduled' : 'Published'} "${created.title}" to ${audience.tenants} tenant(s)`,
      consoleLink: `/customer/comms?id=${created.id}`
    });
    const email = created.alsoEmail ? await emailAnnouncement(app, created) : null;
    return reply.status(201).send({ ...present(created), audience, email });
  });

  app.patch('/api/internal/announcements/:id', { preHandler: writePre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = announcementPatchBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: parsed.error.issues[0]?.message });
    const before = await app.prisma.platformAnnouncement.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Announcement not found' });
    if (before.archivedAt) return reply.status(409).send({ error: 'ARCHIVED', message: 'Archived announcements cannot be edited' });
    const body = parsed.data;
    const targetAll = body.targetAll ?? before.targetAll;
    const tenantIds = body.tenantIds ?? before.tenantIds;
    const planTiers = body.planTiers ?? before.planTiers;
    if (!targetAll && tenantIds.length === 0 && planTiers.length === 0) return reply.status(400).send({ error: 'VALIDATION', message: 'Choose an audience: all tenants, plans or tenants' });
    const updated = await app.prisma.platformAnnouncement.update({
      where: { id },
      data: {
        ...(body.type ? { type: body.type } : {}),
        ...(body.title ? { title: body.title } : {}),
        ...(body.body ? { body: body.body } : {}),
        ...(body.cta !== undefined ? { cta: body.cta === null ? Prisma.JsonNull : body.cta } : {}),
        ...(body.dismissible !== undefined ? { dismissible: body.dismissible } : {}),
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } : {}),
        targetAll,
        tenantIds: targetAll ? [] : tenantIds,
        planTiers: targetAll ? [] : planTiers
      }
    });
    await writePlatformAuditLog(app.prisma, { ...platformAuditActor(request), actorType: 'PLATFORM_USER', action: 'ANNOUNCEMENT_UPDATED', targetTenantId: null, reason: null, metadata: { announcementId: id, fields: Object.keys(body) } });
    return reply.send(present(updated));
  });

  app.post('/api/internal/announcements/:id/archive', { preHandler: writePre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await app.prisma.platformAnnouncement.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Announcement not found' });
    if (row.archivedAt) return reply.send(present(row));
    const archived = await app.prisma.platformAnnouncement.update({ where: { id }, data: { archivedAt: new Date() } });
    await writePlatformAuditLog(app.prisma, { ...platformAuditActor(request), actorType: 'PLATFORM_USER', action: 'ANNOUNCEMENT_ARCHIVED', targetTenantId: null, reason: null, metadata: { announcementId: id } });
    await recordAndPublishActivity(activityDeps(app), {
      service: 'customer.comms',
      type: 'announcement.archived',
      ...staffActor(request),
      subjectType: 'announcement',
      subjectId: id,
      summary: `Archived "${row.title}"`,
      consoleLink: `/customer/comms?id=${id}`
    });
    return reply.send(present(archived));
  });

  // Deleting erases the record; only allowed before anyone saw it (otherwise archive keeps the receipts).
  app.delete('/api/internal/announcements/:id', { preHandler: dangerous('customer.comms.send') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await app.prisma.platformAnnouncement.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Announcement not found' });
    const receipts = await app.prisma.announcementReceipt.count({ where: { announcementId: id } });
    if (receipts > 0) return reply.status(409).send({ error: 'HAS_RECEIPTS', message: 'Tenants have already seen this announcement; archive it instead.' });
    await app.prisma.platformAnnouncement.delete({ where: { id } });
    await writePlatformAuditLog(app.prisma, { ...platformAuditActor(request), actorType: 'PLATFORM_USER', action: 'ANNOUNCEMENT_DELETED', targetTenantId: null, reason: reasonOf(request), metadata: { announcementId: id, title: row.title } });
    return reply.status(204).send();
  });
}
