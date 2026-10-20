import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FeedbackComment, FeedbackItem, Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { FEEDBACK_STATUSES, FEEDBACK_TYPES, npsByMonth, npsFromScores } from '../../../services/feedback.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { notifyTenantUser } from '../../../services/platform-notifier.service.js';
import { writeInternalAudit } from '../internal-audit.js';

// customer.feedback console side (WP-2.8): triage board, item detail with comments, status changes that notify the
// requester, and the NPS summary by month.

const NPS_SUMMARY_MONTHS = 12;

const listQuery = z.object({
  type: z.enum(FEEDBACK_TYPES).optional(),
  status: z.enum(FEEDBACK_STATUSES).optional(),
  tenantId: z.string().min(1).optional(),
  featureKey: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});
const patchBody = z
  .object({
    status: z.enum(FEEDBACK_STATUSES).optional(),
    assignedPlatformUserId: z.string().min(1).nullable().optional(),
    // Optional note to the requester, sent with the status change.
    message: z.string().trim().max(2000).optional()
  })
  .refine((value) => value.status !== undefined || value.assignedPlatformUserId !== undefined, { message: 'Change the status or the assignee.' });
const commentBody = z.object({ body: z.string().trim().min(1).max(5000), visibleToTenant: z.boolean().default(true) });

const read = { preHandler: [authenticatePlatformSession, requireConsolePermission('customer.feedback.read')] };
const write = { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('customer.feedback.write')] };

function validation(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ error: 'VALIDATION', message: error.issues.map((issue) => issue.message).join(' ') });
}

type TenantLabel = { id: string; name: string; slug: string };

function presentItem(item: FeedbackItem, tenant: TenantLabel | null, requester: { email: string; name: string | null } | null) {
  return {
    id: item.id,
    tenant,
    requester,
    type: item.type,
    score: item.score,
    title: item.title,
    body: item.body,
    featureKey: item.featureKey,
    source: item.source,
    status: item.status,
    assignedPlatformUserId: item.assignedPlatformUserId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function presentComment(comment: FeedbackComment) {
  return { id: comment.id, authorType: comment.authorType, authorId: comment.authorId, body: comment.body, visibleToTenant: comment.visibleToTenant, createdAt: comment.createdAt.toISOString() };
}

export async function registerConsoleFeedbackRoutes(app: FastifyInstance) {
  async function labels(items: FeedbackItem[]) {
    const tenantIds = [...new Set(items.map((item) => item.tenantId))];
    const userIds = [...new Set(items.map((item) => item.userId))];
    const [tenants, users] = await Promise.all([
      tenantIds.length ? app.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } }) : [],
      userIds.length ? app.prisma.user.findMany({ where: { id: { in: userIds }, tenantId: { in: tenantIds } }, select: { id: true, email: true, firstName: true, lastName: true } }) : []
    ]);
    return {
      tenant: (id: string) => tenants.find((row) => row.id === id) ?? null,
      user: (id: string) => {
        const row = users.find((user) => user.id === id);
        return row ? { email: row.email, name: [row.firstName, row.lastName].filter(Boolean).join(' ') || null } : null;
      }
    };
  }

  app.get('/api/internal/feedback', read, async (request, reply) => {
    const parsed = listQuery.safeParse(request.query ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const query = parsed.data;
    const where: Prisma.FeedbackItemWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.featureKey ? { featureKey: query.featureKey } : {})
    };
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - NPS_SUMMARY_MONTHS);
    const [items, npsRows] = await Promise.all([
      app.prisma.feedbackItem.findMany({ where, orderBy: { createdAt: 'desc' }, take: query.limit }),
      app.prisma.feedbackItem.findMany({ where: { type: 'NPS', score: { not: null }, createdAt: { gte: since }, ...(query.tenantId ? { tenantId: query.tenantId } : {}) }, select: { score: true, createdAt: true } })
    ]);
    const label = await labels(items);
    return reply.send({
      data: items.map((item) => presentItem(item, label.tenant(item.tenantId), label.user(item.userId))),
      nps: { overall: npsFromScores(npsRows.map((row) => row.score ?? 0)), byMonth: npsByMonth(npsRows) }
    });
  });

  app.get('/api/internal/feedback/:id', read, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await app.prisma.feedbackItem.findUnique({ where: { id }, include: { comments: { orderBy: { createdAt: 'asc' } } } });
    if (!item) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Feedback not found' });
    const label = await labels([item]);
    return reply.send({ item: presentItem(item, label.tenant(item.tenantId), label.user(item.userId)), comments: item.comments.map(presentComment) });
  });

  app.patch('/api/internal/feedback/:id', write, async (request, reply) => {
    const parsed = patchBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const input = parsed.data;
    const { id } = request.params as { id: string };
    const before = await app.prisma.feedbackItem.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Feedback not found' });
    const statusChanged = input.status !== undefined && input.status !== before.status;
    await app.prisma.feedbackItem.updateMany({
      where: { id: before.id, tenantId: before.tenantId },
      data: { ...(input.status !== undefined ? { status: input.status } : {}), ...(input.assignedPlatformUserId !== undefined ? { assignedPlatformUserId: input.assignedPlatformUserId } : {}) }
    });
    const after = await app.prisma.feedbackItem.findFirstOrThrow({ where: { id: before.id, tenantId: before.tenantId } });
    await writeInternalAudit(request, 'feedback.update', 'feedback_item', before.id, { status: before.status, assignedPlatformUserId: before.assignedPlatformUserId }, { status: after.status, assignedPlatformUserId: after.assignedPlatformUserId }, input.message ?? null, { targetTenantId: before.tenantId });
    if (statusChanged) {
      if (input.message) {
        await app.prisma.feedbackComment.create({ data: { feedbackId: before.id, authorType: 'STAFF', authorId: request.platform!.user.id, body: input.message, visibleToTenant: true } });
      }
      const tenants = await labels([after]);
      await recordAndPublishActivity({ prisma: app.prisma, redis: app.redis, log: request.log }, {
        service: 'customer.feedback',
        type: 'feedback.status_changed',
        tenantId: after.tenantId,
        ...staffActor(request),
        subjectType: 'feedback_item',
        subjectId: after.id,
        summary: `${tenants.tenant(after.tenantId)?.name ?? after.tenantId}: "${after.title ?? after.type}" ${before.status.toLowerCase()} → ${after.status.toLowerCase()}`,
        consoleLink: `/customer/feedback/${after.id}`
      });
      await notifyTenantUser(app, {
        tenantId: after.tenantId,
        userId: after.userId,
        event: 'feedback.status_changed',
        title: `Your ${after.type === 'FEATURE_REQUEST' ? 'feature request' : 'feedback'} is ${after.status.toLowerCase().replace(/_/g, ' ')}`,
        body: input.message ?? after.title ?? undefined,
        link: '/help/feedback',
        email: { template: 'feedback_status_changed', data: { title: after.title ?? 'your feedback', status: after.status.toLowerCase().replace(/_/g, ' '), comment: input.message ?? '' } }
      });
    }
    return reply.send({ item: presentItem(after, null, null) });
  });

  app.post('/api/internal/feedback/:id/comments', write, async (request, reply) => {
    const parsed = commentBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { id } = request.params as { id: string };
    const item = await app.prisma.feedbackItem.findUnique({ where: { id } });
    if (!item) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Feedback not found' });
    const comment = await app.prisma.feedbackComment.create({ data: { feedbackId: item.id, authorType: 'STAFF', authorId: request.platform!.user.id, body: parsed.data.body, visibleToTenant: parsed.data.visibleToTenant } });
    await writeInternalAudit(request, 'feedback.comment', 'feedback_item', item.id, null, { commentId: comment.id, visibleToTenant: comment.visibleToTenant }, null, { targetTenantId: item.tenantId });
    if (comment.visibleToTenant) {
      await notifyTenantUser(app, { tenantId: item.tenantId, userId: item.userId, event: 'feedback.commented', title: `Fauward replied to "${item.title ?? 'your feedback'}"`, body: comment.body.slice(0, 280), link: '/help/feedback' });
    }
    return reply.status(201).send({ comment: presentComment(comment) });
  });
}
