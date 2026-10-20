import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type TenantAiLimit } from '@prisma/client';
import { z } from 'zod';
import { MODEL_ROUTING, type AiLimitReachedEvent } from '../shared/services/llm-gateway.service.js';
import { writePlatformAuditLog } from './platform-audit.service.js';
import { recordAndPublishActivity, staffActor, SYSTEM_ACTOR } from './platform-activity.service.js';
import { notifyStaff, notifyTenantAdmins } from './platform-notifier.service.js';
import { platformAuditActor } from '../modules/internal/request-meta.js';

// L16 (WP-2.10): console-set AI limits. The LLM gateway (and the agent sweep) enforce TenantAiLimit; this service is the
// one writer from the console and the one place a reached limit is reported (activity deduped per tenant per day,
// tenant admins and customer-success staff told once).

/** Feature keys a limit may allow: every gateway task plus the agent sweep. */
export const AI_FEATURE_KEYS = [...Object.keys(MODEL_ROUTING), 'agent_sweep'] as const;

const usd = z
  .union([z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Budget must be a USD amount with up to 2 decimals'), z.number().nonnegative().max(9_999_999_999.99)])
  .transform((value) => new Prisma.Decimal(value).toDecimalPlaces(2).toFixed(2));
const requestLimit = z.number().int().min(0).max(100_000_000).nullable();

export const aiLimitBody = z.object({
  monthlyBudgetUsd: usd.nullable(),
  flashRequestLimit: requestLimit,
  proRequestLimit: requestLimit,
  featuresEnabled: z.array(z.string().refine((key) => (AI_FEATURE_KEYS as readonly string[]).includes(key), 'Unknown AI feature')).max(AI_FEATURE_KEYS.length),
  reason: z.string().trim().min(8)
});
export type AiLimitInput = z.infer<typeof aiLimitBody>;

export function presentAiLimit(limit: TenantAiLimit | null) {
  if (!limit) return null;
  return {
    monthlyBudgetUsd: limit.monthlyBudgetUsd === null ? null : limit.monthlyBudgetUsd.toFixed(2),
    flashRequestLimit: limit.flashRequestLimit,
    proRequestLimit: limit.proRequestLimit,
    featuresEnabled: limit.featuresEnabled ?? [],
    updatedAt: limit.updatedAt.toISOString(),
    updatedByPlatformUserId: limit.updatedByPlatformUserId,
    reason: limit.reason
  };
}

/** Human summary for the tenant (in-app + email) and the activity row. */
export function describeAiLimit(limit: Pick<AiLimitInput, 'monthlyBudgetUsd' | 'flashRequestLimit' | 'proRequestLimit' | 'featuresEnabled'>) {
  const parts = [
    limit.monthlyBudgetUsd === null ? 'no monthly budget' : `monthly budget ${limit.monthlyBudgetUsd} USD`,
    limit.flashRequestLimit === null ? null : `${limit.flashRequestLimit} standard requests/month`,
    limit.proRequestLimit === null ? null : `${limit.proRequestLimit} advanced requests/month`,
    limit.featuresEnabled.length === 0 ? 'all AI features' : `features: ${limit.featuresEnabled.join(', ')}`
  ];
  return parts.filter(Boolean).join(' · ');
}

function activityDeps(app: FastifyInstance) {
  return { prisma: app.prisma, redis: app.redis, log: app.log };
}

/** PUT /api/internal/tenants/:id/ai-limit — upsert, audit, activity `ai.limit_changed`, tenant admins notified. */
export async function setTenantAiLimit(app: FastifyInstance, request: FastifyRequest, tenant: { id: string; name: string }, input: AiLimitInput) {
  const before = await app.prisma.tenantAiLimit.findUnique({ where: { tenantId: tenant.id } });
  const data = {
    monthlyBudgetUsd: input.monthlyBudgetUsd,
    flashRequestLimit: input.flashRequestLimit,
    proRequestLimit: input.proRequestLimit,
    featuresEnabled: input.featuresEnabled,
    updatedByPlatformUserId: request.platform!.user.id,
    reason: input.reason
  };
  const limit = await app.prisma.tenantAiLimit.upsert({ where: { tenantId: tenant.id }, update: data, create: { tenantId: tenant.id, ...data } });
  const summary = describeAiLimit(input);
  await writePlatformAuditLog(app.prisma, {
    ...platformAuditActor(request),
    actorType: 'PLATFORM_USER',
    action: 'TENANT_AI_LIMIT_UPDATED',
    targetTenantId: tenant.id,
    reason: input.reason,
    metadata: { before: presentAiLimit(before), after: presentAiLimit(limit) }
  });
  await recordAndPublishActivity(activityDeps(app), {
    service: 'customer.360',
    type: 'ai.limit_changed',
    tenantId: tenant.id,
    ...staffActor(request),
    subjectType: 'tenant',
    subjectId: tenant.id,
    summary: `${tenant.name}: AI limit set (${summary})`,
    severity: 'ATTENTION',
    consoleLink: `/customer/360/${tenant.id}?tab=ai`
  });
  await notifyTenantAdmins(app, {
    tenantId: tenant.id,
    event: 'ai.limit_changed',
    title: 'Fauward changed your AI usage limit',
    body: summary,
    link: '/agent/usage',
    email: { template: 'ai_limit_changed', data: { summary } }
  });
  return limit;
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * Called by the gateway/sweep when a run is refused for budget or request limits. One activity row and one round of
 * notifications per tenant per UTC day; later refusals the same day only hit the existing row.
 */
export async function reportAiLimitReached(app: FastifyInstance, event: AiLimitReachedEvent, now = new Date()) {
  const dedupeKey = `ai.limit_reached:${event.tenantId}:${dayKey(now)}`;
  const existing = await app.prisma.platformActivity.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (existing) return { reported: false as const };
  const tenant = await app.prisma.tenant.findUnique({ where: { id: event.tenantId }, select: { id: true, name: true } });
  if (!tenant) return { reported: false as const };
  const what = event.code === 'AI_BUDGET_EXCEEDED' ? 'monthly AI budget' : `monthly ${event.model === 'deepseek-v4-pro' ? 'advanced' : 'standard'} AI request limit`;
  await recordAndPublishActivity(activityDeps(app), {
    service: 'customer.360',
    type: 'ai.limit_reached',
    tenantId: tenant.id,
    ...SYSTEM_ACTOR,
    subjectType: 'tenant',
    subjectId: tenant.id,
    summary: `${tenant.name} reached its ${what} (${event.feature})`,
    severity: 'ATTENTION',
    consoleLink: `/customer/360/${tenant.id}?tab=ai`,
    metadata: { code: event.code, feature: event.feature, ...(event.model ? { model: event.model } : {}) },
    dedupeKey,
    occurredAt: now
  });
  await notifyTenantAdmins(app, {
    tenantId: tenant.id,
    event: 'ai.limit_reached',
    title: `Your workspace reached its ${what}`,
    body: 'AI features stop until the next month or until the limit is raised. Contact Fauward to change it.',
    link: '/agent/usage',
    email: { template: 'ai_limit_reached', data: { what } }
  });
  await notifyStaff(app, {
    permission: 'customer.success.read',
    event: 'ai.limit_reached',
    title: `${tenant.name} reached its ${what}`,
    link: `/customer/360/${tenant.id}?tab=ai`,
    severity: 'ATTENTION',
    tenantId: tenant.id
  });
  return { reported: true as const };
}
