import type { FastifyInstance } from 'fastify';
import type { FeedbackComment, FeedbackItem } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { FEEDBACK_SOURCES, FEEDBACK_TYPES, npsEligible } from '../../services/feedback.service.js';
import { recordAndPublishActivity } from '../../services/platform-activity.service.js';
import { notifyStaff } from '../../services/platform-notifier.service.js';

// Tenant side of customer.feedback (WP-2.8, L12): send feedback / request a feature (help page or PlanGate), answer
// the in-app NPS survey, and follow your workspace's requests with the comments Fauward made visible.

const TENANT_STAFF = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_FINANCE', 'TENANT_STAFF'];

const createBody = z
  .object({
    type: z.enum(FEEDBACK_TYPES),
    source: z.enum(FEEDBACK_SOURCES).default('HELP_MENU'),
    score: z.number().int().min(0).max(10).optional(),
    title: z.string().trim().min(3).max(200).optional(),
    body: z.string().trim().max(5000).optional(),
    featureKey: z.string().trim().min(1).max(100).optional()
  })
  .refine((value) => value.type !== 'NPS' || value.score !== undefined, { message: 'An NPS answer needs a score from 0 to 10.', path: ['score'] })
  .refine((value) => value.type === 'NPS' || Boolean(value.title), { message: 'Give your feedback a short title.', path: ['title'] });
const promptBody = z.object({ event: z.enum(['SHOWN', 'DISMISSED']) });

function present(item: FeedbackItem & { comments?: FeedbackComment[] }) {
  return {
    id: item.id,
    type: item.type,
    score: item.score,
    title: item.title,
    body: item.body,
    featureKey: item.featureKey,
    source: item.source,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    comments: (item.comments ?? []).filter((comment) => comment.visibleToTenant).map((comment) => ({ id: comment.id, authorType: comment.authorType, body: comment.body, createdAt: comment.createdAt.toISOString() }))
  };
}

export async function registerFeedbackRoutes(app: FastifyInstance) {
  const pre = { preHandler: [authenticate, requireRole(TENANT_STAFF)] };

  app.post('/api/v1/tenants/me/feedback', pre, async (request, reply) => {
    const tenantId = request.tenant?.id;
    const userId = request.user?.sub;
    if (!tenantId || !userId) return reply.status(400).send({ error: 'Tenant context required' });
    const parsed = createBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: parsed.error.issues.map((issue) => issue.message).join(' ') });
    const input = parsed.data;
    const now = new Date();
    const item = await app.prisma.$transaction(async (tx) => {
      const created = await tx.feedbackItem.create({
        data: { tenantId, userId, type: input.type, score: input.type === 'NPS' ? input.score ?? null : null, title: input.title ?? null, body: input.body ?? null, featureKey: input.featureKey ?? null, source: input.type === 'NPS' ? 'IN_APP_SURVEY' : input.source }
      });
      if (input.type === 'NPS') {
        await tx.npsPromptState.upsert({ where: { userId }, update: { lastRespondedAt: now, eligibleAt: null }, create: { userId, tenantId, lastRespondedAt: now } });
      }
      return created;
    });
    const tenantName = request.tenant?.name ?? request.tenant?.slug ?? tenantId;
    const label = input.type === 'NPS' ? `NPS ${input.score}` : input.type === 'FEATURE_REQUEST' ? `Feature request: ${input.title}` : `${input.type.toLowerCase()}: ${input.title}`;
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: request.log },
      {
        service: 'customer.feedback',
        type: 'feedback.created',
        tenantId,
        actorType: 'TENANT_USER',
        actorId: userId,
        actorLabel: request.user?.email ?? 'Tenant user',
        subjectType: 'feedback_item',
        subjectId: item.id,
        summary: `${tenantName}: ${label}`.slice(0, 240),
        severity: input.type === 'NPS' && (input.score ?? 10) <= 6 ? 'ATTENTION' : 'INFO',
        consoleLink: `/customer/feedback/${item.id}`,
        dedupeKey: `feedback.created:${item.id}`,
        metadata: { type: input.type, source: item.source, ...(input.featureKey ? { featureKey: input.featureKey } : {}) }
      }
    );
    if (input.type === 'FEATURE_REQUEST') {
      await notifyStaff(app, {
        permission: 'customer.feedback.read',
        event: 'feedback.feature_requested',
        title: `Feature request from ${tenantName}`,
        body: input.featureKey ? `${input.title} (${input.featureKey})` : input.title,
        link: `/customer/feedback/${item.id}`,
        tenantId
      });
    }
    return reply.status(201).send({ item: present(item) });
  });

  app.get('/api/v1/tenants/me/feedback', pre, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const items = await app.prisma.feedbackItem.findMany({
      where: { tenantId, type: { not: 'NPS' } },
      include: { comments: { where: { visibleToTenant: true }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return reply.send({ items: items.map(present) });
  });

  app.get('/api/v1/tenants/me/nps-eligibility', pre, async (request, reply) => {
    const userId = request.user?.sub;
    const tenantId = request.tenant?.id;
    if (!userId || !tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const state = await app.prisma.npsPromptState.findFirst({ where: { userId, tenantId } });
    return reply.send({ eligible: npsEligible(state) });
  });

  // The prompt reports when it was shown and when the user closed it without answering (ACC-FB-4).
  app.post('/api/v1/tenants/me/nps-prompt', pre, async (request, reply) => {
    const userId = request.user?.sub;
    const tenantId = request.tenant?.id;
    if (!userId || !tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const parsed = promptBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: 'event must be SHOWN or DISMISSED' });
    const now = new Date();
    const data = parsed.data.event === 'SHOWN' ? { lastPromptedAt: now } : { dismissedAt: now, eligibleAt: null };
    await app.prisma.npsPromptState.upsert({ where: { userId }, update: data, create: { userId, tenantId, ...data } });
    return reply.status(204).send();
  });
}
