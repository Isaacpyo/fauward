import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type CSPlaybook, type CSPlaybookRun, type TenantHealthScore } from '@prisma/client';
import type { Permission } from '@fauward/internal-rbac';
import { PERMISSIONS } from '@fauward/internal-rbac';
import { z } from 'zod';
import { auditedMutation, staffMutationActor } from './console-mutation.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from './platform-activity.service.js';
import { notifyStaff, notifyTenantAdmins } from './platform-notifier.service.js';
import { nextTicketNumber } from './support-ticket.service.js';
import { resolveTenantEntitlements } from './tenant-entitlements.service.js';
import { mrrForSubscription } from './revenue/mrr.service.js';
import { HEALTH_BANDS } from '../config/health-score.config.js';

// customer.success (WP-4.8). Reads come from the nightly health scores (WP-3.3): distribution and movers, at-risk
// (latest < 50, or down two weeks running), expansion (usage over 80% of a plan limit). Playbooks are step lists run per
// tenant — manually or by a trigger the 10-minute executor evaluates — with each step's result recorded on the run.

const SERVICE = 'customer.success';
const DAY_MS = 86_400_000;
// The configured band (WP-3.3) is the one at-risk threshold, shared with the score labels.
export const AT_RISK_SCORE = HEALTH_BANDS.atRiskBelow;
export const EXPANSION_RATIO = 0.8;
export const TRIGGER_COOLDOWN_DAYS = 30;
const EXECUTOR = { kind: 'system' as const, id: 'customer.playbook-executor', label: 'Playbook executor' };

export const PLAYBOOK_TRIGGERS = ['MANUAL', 'HEALTH_BELOW', 'TRIAL_ENDING', 'PAYMENT_FAILED'] as const;
export const PLAYBOOK_EMAIL_TEMPLATES = ['platform_announcement', 'onboarding_nudge'] as const;

export class SuccessError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

// ── Steps and playbooks ──────────────────────────────────────────────────────

const stepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('EMAIL_TENANT_ADMINS'), template: z.enum(PLAYBOOK_EMAIL_TEMPLATES), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal('CREATE_PLATFORM_TICKET'), subject: z.string().trim().min(3).max(200), body: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal('NOTIFY_STAFF'), permission: z.string().refine((value) => (PERMISSIONS as readonly string[]).includes(value), 'Unknown permission'), text: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal('WAIT'), days: z.number().int().min(1).max(90) })
]);
export type PlaybookStep = z.infer<typeof stepSchema>;

export const playbookBody = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional(),
    trigger: z.enum(PLAYBOOK_TRIGGERS),
    triggerValue: z.number().int().min(1).max(100).nullable().optional(),
    steps: z.array(stepSchema).min(1).max(20),
    active: z.boolean().default(true)
  })
  .refine((body) => (body.trigger === 'HEALTH_BELOW' || body.trigger === 'TRIAL_ENDING' ? typeof body.triggerValue === 'number' : true), { message: 'HEALTH_BELOW needs a score and TRIAL_ENDING a number of days', path: ['triggerValue'] });

export const playbookPatchBody = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  trigger: z.enum(PLAYBOOK_TRIGGERS).optional(),
  triggerValue: z.number().int().min(1).max(100).nullable().optional(),
  steps: z.array(stepSchema).min(1).max(20).optional(),
  active: z.boolean().optional()
});

export const runBody = z.object({ tenantId: z.string().min(1) });

function parseSteps(value: Prisma.JsonValue): PlaybookStep[] {
  const parsed = z.array(stepSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function presentPlaybook(row: CSPlaybook, counts?: { runs: number; running: number }) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trigger: row.trigger,
    triggerValue: row.triggerValue,
    steps: parseSteps(row.steps),
    active: row.active,
    runs: counts?.runs ?? null,
    running: counts?.running ?? null,
    updatedAt: row.updatedAt.toISOString()
  };
}

type RunStep = PlaybookStep & { status: 'PENDING' | 'DONE' | 'FAILED' | 'WAITING'; result?: Prisma.JsonValue; at?: string };

function runSteps(row: Pick<CSPlaybookRun, 'steps'>): RunStep[] {
  return Array.isArray(row.steps) ? (row.steps as unknown as RunStep[]) : [];
}

function presentRun(row: CSPlaybookRun, tenant?: { id: string; name: string; slug: string } | null) {
  return {
    id: row.id,
    playbookId: row.playbookId,
    tenant: tenant ?? { id: row.tenantId, name: row.tenantId, slug: null },
    status: row.status,
    triggerSource: row.triggerSource,
    startedBy: row.startedBy,
    currentStep: row.currentStep,
    steps: runSteps(row),
    nextActionAt: row.nextActionAt?.toISOString() ?? null,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null
  };
}

export async function listPlaybooks(app: Pick<FastifyInstance, 'prisma'>) {
  const [rows, totals, running] = await Promise.all([
    app.prisma.cSPlaybook.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    app.prisma.cSPlaybookRun.groupBy({ by: ['playbookId'], _count: { _all: true } }),
    app.prisma.cSPlaybookRun.groupBy({ by: ['playbookId'], where: { status: { in: ['RUNNING', 'WAITING'] } }, _count: { _all: true } })
  ]);
  const total = new Map(totals.map((row) => [row.playbookId, row._count._all]));
  const live = new Map(running.map((row) => [row.playbookId, row._count._all]));
  return { data: rows.map((row) => presentPlaybook(row, { runs: total.get(row.id) ?? 0, running: live.get(row.id) ?? 0 })), triggers: PLAYBOOK_TRIGGERS, templates: PLAYBOOK_EMAIL_TEMPLATES };
}

export async function getPlaybook(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.cSPlaybook.findUnique({ where: { id } });
  return row ? presentPlaybook(row) : null;
}

export async function createPlaybook(app: FastifyInstance, request: FastifyRequest, body: z.infer<typeof playbookBody>) {
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const row = await tx.cSPlaybook.create({
      data: { name: body.name, description: body.description ?? null, trigger: body.trigger, triggerValue: body.triggerValue ?? null, steps: body.steps as Prisma.InputJsonArray, active: body.active, createdBy: request.platform!.user.id }
    });
    return {
      result: presentPlaybook(row),
      audit: { action: 'CS_PLAYBOOK_CREATED', metadata: { playbookId: row.id, trigger: row.trigger, steps: body.steps.length } },
      activity: { type: 'playbook.created', subjectType: 'cs_playbook', subjectId: row.id, summary: `Playbook created: ${row.name} (${row.trigger.toLowerCase().replace('_', ' ')})`, consoleLink: `/customer/success/playbooks/${row.id}` }
    };
  });
}

export async function patchPlaybook(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof playbookPatchBody>) {
  const before = await app.prisma.cSPlaybook.findUnique({ where: { id } });
  if (!before) throw new SuccessError(404, 'PLAYBOOK_NOT_FOUND', 'Playbook not found');
  const trigger = body.trigger ?? before.trigger;
  const triggerValue = body.triggerValue !== undefined ? body.triggerValue : before.triggerValue;
  if ((trigger === 'HEALTH_BELOW' || trigger === 'TRIAL_ENDING') && typeof triggerValue !== 'number') throw new SuccessError(400, 'TRIGGER_VALUE_REQUIRED', 'HEALTH_BELOW needs a score and TRIAL_ENDING a number of days');
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const row = await tx.cSPlaybook.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.trigger !== undefined ? { trigger: body.trigger } : {}),
        ...(body.triggerValue !== undefined ? { triggerValue: body.triggerValue } : {}),
        ...(body.steps !== undefined ? { steps: body.steps as Prisma.InputJsonArray } : {}),
        ...(body.active !== undefined ? { active: body.active } : {})
      }
    });
    return {
      result: presentPlaybook(row),
      audit: { action: 'CS_PLAYBOOK_UPDATED', metadata: { playbookId: id, fields: Object.keys(body) } },
      activity: { type: 'playbook.updated', subjectType: 'cs_playbook', subjectId: id, summary: `Playbook ${row.name}: ${Object.keys(body).join(', ')}`, consoleLink: `/customer/success/playbooks/${id}` }
    };
  });
}

export async function deletePlaybook(app: FastifyInstance, request: FastifyRequest, id: string) {
  const before = await app.prisma.cSPlaybook.findUnique({ where: { id } });
  if (!before) throw new SuccessError(404, 'PLAYBOOK_NOT_FOUND', 'Playbook not found');
  const running = await app.prisma.cSPlaybookRun.count({ where: { playbookId: id, status: { in: ['RUNNING', 'WAITING'] } } });
  if (running > 0) throw new SuccessError(409, 'PLAYBOOK_RUNNING', `${running} run(s) are in progress; deactivate the playbook instead.`);
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    await tx.cSPlaybook.delete({ where: { id } });
    return {
      result: { id },
      audit: { action: 'CS_PLAYBOOK_DELETED', metadata: { playbookId: id, name: before.name } },
      activity: { type: 'playbook.deleted', subjectType: 'cs_playbook', subjectId: id, summary: `Playbook deleted: ${before.name}`, severity: 'ATTENTION' }
    };
  });
}

export async function listRuns(app: Pick<FastifyInstance, 'prisma'>, playbookId: string) {
  const rows = await app.prisma.cSPlaybookRun.findMany({ where: { playbookId }, orderBy: { createdAt: 'desc' }, take: 100 });
  const tenantIds = [...new Set(rows.map((row) => row.tenantId))];
  const tenants = tenantIds.length ? await app.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } }) : [];
  const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  return { data: rows.map((row) => presentRun(row, byId.get(row.tenantId) ?? null)) };
}

// ── Runs and the executor ────────────────────────────────────────────────────

type ExecApp = Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>;

/** Starts a run for one tenant; the first steps (up to a WAIT) run straight away. */
export async function startRun(app: ExecApp, playbook: CSPlaybook, tenantId: string, source: { trigger: string; startedBy: string | null }, request?: FastifyRequest) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) throw new SuccessError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  const steps = parseSteps(playbook.steps);
  if (steps.length === 0) throw new SuccessError(409, 'PLAYBOOK_EMPTY', 'The playbook has no valid steps');
  const now = new Date();
  const actor = request ? staffMutationActor(request) : EXECUTOR;
  const run = await auditedMutation(app, SERVICE, actor, async (tx) => {
    const row = await tx.cSPlaybookRun.create({
      data: { playbookId: playbook.id, tenantId, status: 'RUNNING', steps: steps.map((step) => ({ ...step, status: 'PENDING' })) as Prisma.InputJsonArray, currentStep: 0, startedAt: now, nextActionAt: now, triggerSource: source.trigger, startedBy: source.startedBy }
    });
    return {
      result: row,
      audit: { action: 'CS_PLAYBOOK_RUN_STARTED', targetTenantId: tenantId, metadata: { playbookId: playbook.id, runId: row.id, trigger: source.trigger } },
      activity: { type: 'playbook.run_started', tenantId, subjectType: 'cs_playbook_run', subjectId: row.id, summary: `Playbook "${playbook.name}" started for ${tenant.name} (${source.trigger.toLowerCase().replace('_', ' ')})`, consoleLink: `/customer/success/playbooks/${playbook.id}/runs` }
    };
  });
  await advanceRun(app, run.id);
  return app.prisma.cSPlaybookRun.findUniqueOrThrow({ where: { id: run.id } });
}

export async function manualRun(app: FastifyInstance, request: FastifyRequest, playbookId: string, tenantId: string) {
  const playbook = await app.prisma.cSPlaybook.findUnique({ where: { id: playbookId } });
  if (!playbook) throw new SuccessError(404, 'PLAYBOOK_NOT_FOUND', 'Playbook not found');
  if (!playbook.active) throw new SuccessError(409, 'PLAYBOOK_INACTIVE', 'Activate the playbook to run it');
  const run = await startRun(app, playbook, tenantId, { trigger: 'MANUAL', startedBy: request.platform!.user.id }, request);
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } });
  return presentRun(run, tenant);
}

async function performStep(app: ExecApp, run: CSPlaybookRun, step: PlaybookStep): Promise<Prisma.InputJsonObject> {
  switch (step.type) {
    case 'EMAIL_TENANT_ADMINS': {
      const result = await notifyTenantAdmins(app as FastifyInstance, { tenantId: run.tenantId, event: 'cs.outreach', title: step.subject, body: step.body.slice(0, 500), email: { template: step.template, data: { title: step.subject, body: step.body } } });
      return { inApp: result.inApp, emailsQueued: result.emailsQueued };
    }
    case 'CREATE_PLATFORM_TICKET': {
      const now = new Date();
      const ticketNumber = await nextTicketNumber(app.prisma, run.tenantId, 'PLATFORM', now);
      const ticket = await app.prisma.supportTicket.create({
        data: {
          tenantId: run.tenantId,
          ticketNumber,
          audience: 'PLATFORM',
          subject: step.subject,
          category: 'OTHER',
          priority: 'NORMAL',
          assignedPlatformUserId: run.startedBy,
          lastMessageAt: now,
          lastMessageAuthorType: 'STAFF',
          firstResponseAt: now,
          messages: { create: { tenantId: run.tenantId, authorType: 'STAFF', platformAuthorId: run.startedBy, visibility: 'PUBLIC', body: step.body, createdAt: now } }
        }
      });
      await notifyTenantAdmins(app as FastifyInstance, { tenantId: run.tenantId, event: 'support.reply_from_fauward', title: `Fauward opened ${ticketNumber}: ${step.subject}`, body: step.body.slice(0, 500), link: '/help', email: { template: 'support_reply_from_fauward', data: { ticketNumber, excerpt: step.body.slice(0, 300) } } });
      return { ticketId: ticket.id, ticketNumber };
    }
    case 'NOTIFY_STAFF': {
      const result = await notifyStaff(app as FastifyInstance, { permission: step.permission as Permission, event: 'cs.playbook_step', title: step.text, link: `/customer/360/${run.tenantId}`, severity: 'ATTENTION', tenantId: run.tenantId });
      return { notified: result.inApp };
    }
    case 'WAIT':
      return { waitedDays: step.days };
  }
}

/**
 * Runs the due steps of one run in order. Each step is claimed by moving `currentStep` forward with a conditional
 * update, so re-running (or two executors) never performs a step twice; a WAIT step parks the run until its time.
 */
export async function advanceRun(app: ExecApp, runId: string, now = new Date()) {
  let performed = 0;
  for (;;) {
    const run = await app.prisma.cSPlaybookRun.findUnique({ where: { id: runId } });
    if (!run || (run.status !== 'RUNNING' && run.status !== 'WAITING')) return performed;
    if (run.nextActionAt && run.nextActionAt > now) return performed;
    const steps = runSteps(run);
    const index = run.currentStep;
    const step = steps[index];
    if (!step) {
      await app.prisma.cSPlaybookRun.updateMany({ where: { id: run.id, tenantId: run.tenantId, currentStep: index, status: { in: ['RUNNING', 'WAITING'] } }, data: { status: 'COMPLETED', completedAt: now, nextActionAt: null } });
      return performed;
    }
    const isWait = step.type === 'WAIT';
    const claimed = await app.prisma.cSPlaybookRun.updateMany({
      where: { id: run.id, tenantId: run.tenantId, currentStep: index, status: run.status },
      data: { currentStep: index + 1, status: isWait ? 'WAITING' : 'RUNNING', nextActionAt: isWait ? new Date(now.getTime() + step.days * DAY_MS) : now }
    });
    if (claimed.count !== 1) return performed;
    let status: RunStep['status'] = isWait ? 'WAITING' : 'DONE';
    let result: Prisma.InputJsonObject;
    try {
      result = await performStep(app, run, step);
    } catch (error) {
      status = 'FAILED';
      result = { error: error instanceof Error ? error.message.slice(0, 500) : 'Step failed' };
      app.log.error({ err: error, runId: run.id, step: step.type }, 'Playbook step failed');
    }
    const updatedSteps = steps.map((item, position) => (position === index ? { ...item, status, result, at: now.toISOString() } : position < index && item.status === 'WAITING' ? { ...item, status: 'DONE' as const } : item));
    await app.prisma.cSPlaybookRun.update({ where: { id: run.id }, data: { steps: updatedSteps as unknown as Prisma.InputJsonArray, ...(status === 'FAILED' ? { status: 'FAILED', error: String(result.error), completedAt: now, nextActionAt: null } : {}) } });
    await recordAndPublishActivity(app, {
      service: SERVICE,
      type: status === 'FAILED' ? 'playbook.step_failed' : 'playbook.step_done',
      tenantId: run.tenantId,
      ...SYSTEM_ACTOR,
      actorLabel: 'Playbook executor',
      subjectType: 'cs_playbook_run',
      subjectId: run.id,
      summary: `Playbook step ${index + 1}: ${step.type.toLowerCase().replace(/_/g, ' ')}${status === 'FAILED' ? ' failed' : ''}`,
      severity: status === 'FAILED' ? 'ATTENTION' : 'INFO',
      consoleLink: run.playbookId ? `/customer/success/playbooks/${run.playbookId}/runs` : null,
      dedupeKey: `playbook.step:${run.id}:${index}`
    });
    performed += 1;
    if (status === 'FAILED' || isWait) return performed;
  }
}

/** Tenants (of `tenantIds`) where this playbook already started since `since`; one query for the whole match list. */
async function recentlyStarted(app: ExecApp, playbookId: string, tenantIds: string[], since: Date) {
  if (tenantIds.length === 0) return new Set<string>();
  const rows = await app.prisma.cSPlaybookRun.findMany({ where: { playbookId, tenantId: { in: tenantIds }, createdAt: { gte: since } }, select: { tenantId: true }, distinct: ['tenantId'] });
  return new Set(rows.map((row) => row.tenantId));
}

/** Latest score per tenant (one query; tenants scored at least once). */
async function latestScores(app: Pick<FastifyInstance, 'prisma'>, since = new Date(Date.now() - 45 * DAY_MS), tenantIds?: string[]) {
  const rows = await app.prisma.tenantHealthScore.findMany({ where: { computedAt: { gte: since }, ...(tenantIds ? { tenantId: { in: tenantIds } } : {}) }, orderBy: [{ tenantId: 'asc' }, { computedAt: 'desc' }] });
  const byTenant = new Map<string, TenantHealthScore[]>();
  for (const row of rows) {
    const list = byTenant.get(row.tenantId) ?? [];
    list.push(row);
    byTenant.set(row.tenantId, list);
  }
  return byTenant;
}

/** Tenants a trigger currently matches. */
async function triggerMatches(app: ExecApp, playbook: CSPlaybook, now: Date): Promise<string[]> {
  if (playbook.trigger === 'HEALTH_BELOW' && playbook.triggerValue) {
    const scores = await latestScores(app);
    return [...scores.entries()].filter(([, list]) => list[0].score < playbook.triggerValue!).map(([tenantId]) => tenantId);
  }
  if (playbook.trigger === 'TRIAL_ENDING' && playbook.triggerValue) {
    const subs = await app.prisma.subscription.findMany({ where: { status: 'TRIALING', trialEnd: { gt: now, lte: new Date(now.getTime() + playbook.triggerValue * DAY_MS) } }, select: { tenantId: true } });
    return subs.map((row) => row.tenantId);
  }
  if (playbook.trigger === 'PAYMENT_FAILED') {
    const enrollments = await app.prisma.dunningEnrollment.findMany({ where: { status: 'ACTIVE' }, select: { tenantId: true } });
    return [...new Set(enrollments.map((row) => row.tenantId))];
  }
  return [];
}

/** The 10-minute executor: start triggered runs (at most once per tenant and playbook in 30 days), then run due steps. */
export async function runPlaybookExecutor(app: ExecApp, now = new Date()) {
  const playbooks = await app.prisma.cSPlaybook.findMany({ where: { active: true, trigger: { not: 'MANUAL' } } });
  let started = 0;
  for (const playbook of playbooks) {
    const cooldown = new Date(now.getTime() - TRIGGER_COOLDOWN_DAYS * DAY_MS);
    const matches = await triggerMatches(app, playbook, now);
    const already = await recentlyStarted(app, playbook.id, matches, cooldown);
    for (const tenantId of matches) {
      if (already.has(tenantId)) continue;
      try {
        await startRun(app, playbook, tenantId, { trigger: playbook.trigger, startedBy: null });
        started += 1;
      } catch (error) {
        app.log.error({ err: error, playbookId: playbook.id, tenantId }, 'Could not start a triggered playbook run');
      }
    }
  }
  const due = await app.prisma.cSPlaybookRun.findMany({ where: { status: { in: ['RUNNING', 'WAITING'] }, nextActionAt: { lte: now } }, select: { id: true }, take: 500 });
  let steps = 0;
  for (const run of due) steps += await advanceRun(app, run.id, now);
  return { playbooks: playbooks.length, started, runsDue: due.length, stepsRun: steps };
}

// ── Health views ─────────────────────────────────────────────────────────────

function scoreAt(list: TenantHealthScore[], at: Date) {
  return list.find((row) => row.computedAt <= at) ?? null;
}

async function tenantRefs(app: Pick<FastifyInstance, 'prisma'>, ids: string[]) {
  const tenants = ids.length ? await app.prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true, status: true, plan: true } }) : [];
  return new Map(tenants.map((tenant) => [tenant.id, tenant]));
}

export async function successOverview(app: Pick<FastifyInstance, 'prisma'>) {
  const scores = await latestScores(app);
  const latest = [...scores.values()].map((list) => list[0]);
  const buckets = { atRisk: latest.filter((row) => row.score < AT_RISK_SCORE).length, watch: latest.filter((row) => row.score >= AT_RISK_SCORE && row.score < HEALTH_BANDS.healthyFrom).length, healthy: latest.filter((row) => row.score >= HEALTH_BANDS.healthyFrom).length };
  const movers = [...scores.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([tenantId, list]) => ({ tenantId, score: list[0].score, previous: list[1].score, change: list[0].score - list[1].score, computedAt: list[0].computedAt.toISOString() }))
    .filter((row) => row.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.computedAt.localeCompare(a.computedAt))
    .slice(0, 10);
  const refs = await tenantRefs(app, movers.map((row) => row.tenantId));
  const lastRun = await app.prisma.scheduledJobRun.findFirst({ where: { jobName: 'customer.health-scoring' }, orderBy: { startedAt: 'desc' }, select: { status: true, startedAt: true } });
  return {
    scoredTenants: latest.length,
    distribution: buckets,
    movers: movers.map((row) => ({ ...row, tenant: refs.get(row.tenantId) ?? { id: row.tenantId, name: row.tenantId, slug: null } })),
    lastScoringRun: lastRun ? { status: lastRun.status, startedAt: lastRun.startedAt.toISOString() } : null
  };
}

/** `tenantIds` narrows the scan (a QBR asks about one tenant). */
export async function atRisk(app: Pick<FastifyInstance, 'prisma'>, now = new Date(), tenantIds?: string[]) {
  const scores = await latestScores(app, new Date(now.getTime() - 45 * DAY_MS), tenantIds);
  const flagged = [...scores.entries()]
    .map(([tenantId, list]) => {
      const latest = list[0];
      const weekAgo = scoreAt(list, new Date(now.getTime() - 7 * DAY_MS));
      const twoWeeksAgo = scoreAt(list, new Date(now.getTime() - 14 * DAY_MS));
      const decliningTwoWeeks = Boolean(weekAgo && twoWeeksAgo && weekAgo.id !== twoWeeksAgo.id && latest.score < weekAgo.score && weekAgo.score < twoWeeksAgo.score);
      const reasons = [...(latest.score < AT_RISK_SCORE ? [`score ${latest.score} < ${AT_RISK_SCORE}`] : []), ...(decliningTwoWeeks ? [`down two weeks running (${twoWeeksAgo!.score} → ${weekAgo!.score} → ${latest.score})`] : [])];
      return { tenantId, latest, reasons };
    })
    .filter((row) => row.reasons.length > 0);
  const tenants = flagged.length ? await app.prisma.tenant.findMany({ where: { id: { in: flagged.map((row) => row.tenantId) } }, include: { subscription: true } }) : [];
  const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const data = await Promise.all(
    flagged.map(async (row) => {
      const tenant = byId.get(row.tenantId);
      // ARR from mrrForSubscription (list price, overrides, contracts, FX) — no plan-price literals.
      const mrr = tenant ? await mrrForSubscription(app.prisma, tenant, tenant.subscription) : null;
      const arr = mrr ? new Prisma.Decimal(mrr.amount).mul(12) : new Prisma.Decimal(0);
      return {
        tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status, plan: tenant.plan } : { id: row.tenantId, name: row.tenantId, slug: null, status: null, plan: null },
        score: row.latest.score,
        trend: row.latest.trend,
        computedAt: row.latest.computedAt.toISOString(),
        reasons: row.reasons,
        arr: arr.toFixed(2),
        arrCurrency: mrr?.currency ?? null
      };
    })
  );
  return { data: data.sort((a, b) => Number(b.arr) - Number(a.arr) || a.score - b.score), threshold: AT_RISK_SCORE };
}

export async function expansionCandidates(app: Pick<FastifyInstance, 'prisma'>, now = new Date(), tenantIds?: string[]) {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const tenants = await app.prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'TRIALING'] }, ...(tenantIds ? { id: { in: tenantIds } } : {}) }, select: { id: true, name: true, slug: true, plan: true, maxStaff: true, maxShipmentsPm: true, maxOrganisations: true, limitsOverriddenAt: true } });
  const usage = tenants.length ? await app.prisma.usageRecord.findMany({ where: { month, tenantId: { in: tenants.map((tenant) => tenant.id) } }, select: { tenantId: true, shipments: true } }) : [];
  const shipments = new Map(usage.map((row) => [row.tenantId, row.shipments]));
  const staff = tenants.length ? await app.prisma.user.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenants.map((tenant) => tenant.id) }, isActive: true, role: { notIn: ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] } }, _count: { _all: true } }) : [];
  const seats = new Map(staff.map((row) => [row.tenantId, row._count._all]));
  // A tenant with no shipments this month and no active staff cannot be over any limit, so its entitlements are not
  // resolved; the rest resolve ten at a time instead of one query round-trip per tenant in sequence.
  const candidates = tenants.filter((tenant) => (shipments.get(tenant.id) ?? 0) > 0 || (seats.get(tenant.id) ?? 0) > 0);
  const data: Array<{ tenant: { id: string; name: string; slug: string; plan: string }; signals: Array<{ limit: string; used: number; of: number; ratio: number }> }> = [];
  for (let index = 0; index < candidates.length; index += 10) {
    const batch = candidates.slice(index, index + 10);
    const resolved = await Promise.all(batch.map(async (tenant) => ({ tenant, limits: (await resolveTenantEntitlements(app.prisma, tenant, now)).limits })));
    for (const { tenant, limits } of resolved) {
      const signals: Array<{ limit: string; used: number; of: number; ratio: number }> = [];
      const used = shipments.get(tenant.id) ?? 0;
      if (limits.maxShipmentsPm > 0 && used / limits.maxShipmentsPm > EXPANSION_RATIO) signals.push({ limit: 'shipments this month', used, of: limits.maxShipmentsPm, ratio: used / limits.maxShipmentsPm });
      const seatCount = seats.get(tenant.id) ?? 0;
      if (limits.maxStaff > 0 && seatCount / limits.maxStaff > EXPANSION_RATIO) signals.push({ limit: 'staff seats', used: seatCount, of: limits.maxStaff, ratio: seatCount / limits.maxStaff });
      if (signals.length) data.push({ tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan }, signals });
    }
  }
  return { data: data.sort((a, b) => Math.max(...b.signals.map((s) => s.ratio)) - Math.max(...a.signals.map((s) => s.ratio))), month, threshold: EXPANSION_RATIO };
}
