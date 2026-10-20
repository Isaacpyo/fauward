import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from '../services/platform-activity.service.js';

// platform.jobs (WP-3.8, architecture §10): every scheduled job is declared with registerScheduledJob and runs through
// runScheduledJob, which writes one ScheduledJobRun row per execution (start, finish, status, duration, error, actor).

export type ScheduledJobResult = Prisma.InputJsonObject | void;

export type ScheduledJobDefinition = {
  name: string;
  /** Cron pattern (UTC). */
  pattern: string;
  /** BullMQ repeat job id; kept stable so a deploy does not register a second repeatable. */
  repeatJobId: string;
  description: string;
  timeoutMs: number;
  handler: (app: FastifyInstance) => Promise<ScheduledJobResult>;
};

export const DEFAULT_JOB_TIMEOUT_MS = 15 * 60_000;
export const SCHEDULE_TRIGGER = 'SCHEDULE';

const registry = new Map<string, ScheduledJobDefinition>();

export function registerScheduledJob(definition: Omit<ScheduledJobDefinition, 'timeoutMs'> & { timeoutMs?: number }) {
  const full: ScheduledJobDefinition = { ...definition, timeoutMs: definition.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS };
  registry.set(full.name, full);
  return full;
}

export function listScheduledJobs() {
  return [...registry.values()];
}

export function findScheduledJob(name: string) {
  return registry.get(name);
}

export class ScheduledJobTimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`${name} did not finish within ${Math.round(timeoutMs / 1000)} s`);
    this.name = 'ScheduledJobTimeoutError';
  }
}

type RunDb = Pick<FastifyInstance['prisma'], 'scheduledJobRun'>;
type RunTrigger = { bullJobId?: string | null; triggeredBy?: string | null; reason?: string | null };

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 2_000);
  return 'Job failed';
}

/**
 * Runs one job in system context (workers have no request context; tenant-scoped reads are explicit) and records the
 * run. A timed-out handler is reported TIMED_OUT and the BullMQ job fails; the handler itself cannot be cancelled and is
 * left to finish (jobs are idempotent, §10). Errors are rethrown so BullMQ marks the job failed.
 */
export async function runScheduledJob(app: FastifyInstance, definition: ScheduledJobDefinition, trigger: RunTrigger = {}) {
  const db: RunDb = app.prisma;
  const startedAt = new Date();
  const run = await runWithTenantContext(systemContext(), async () =>
    db.scheduledJobRun.create({
      data: {
        jobName: definition.name,
        bullJobId: trigger.bullJobId ?? null,
        status: 'RUNNING',
        triggeredBy: trigger.triggeredBy || SCHEDULE_TRIGGER,
        reason: trigger.reason ?? null,
        startedAt
      },
      select: { id: true }
    })
  ).catch((err: unknown) => {
    app.log.error({ err, jobName: definition.name }, 'Failed to record scheduled job start');
    return null;
  });

  const finish = async (data: Prisma.ScheduledJobRunUpdateInput) => {
    if (!run) return;
    await runWithTenantContext(systemContext(), async () => db.scheduledJobRun.update({ where: { id: run.id }, data })).catch((err: unknown) =>
      app.log.error({ err, jobName: definition.name, runId: run.id }, 'Failed to record scheduled job finish')
    );
  };

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ScheduledJobTimeoutError(definition.name, definition.timeoutMs)), definition.timeoutMs);
  });
  try {
    const result = await Promise.race([runWithTenantContext(systemContext(), () => definition.handler(app)), timeout]);
    const finishedAt = new Date();
    await finish({ status: 'SUCCEEDED', finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), ...(result ? { result } : {}) });
    app.log.info({ jobName: definition.name, ...(result ?? {}) }, 'Scheduled job finished');
    return { runId: run?.id ?? null, result: result ?? null };
  } catch (error: unknown) {
    const finishedAt = new Date();
    await finish({
      status: error instanceof ScheduledJobTimeoutError ? 'TIMED_OUT' : 'FAILED',
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: errorMessage(error)
    });
    // Failures surface on the console dashboard (pillar alert count, platform.jobs activity).
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: app.log },
      {
        service: 'platform.jobs',
        type: 'job.failed',
        ...SYSTEM_ACTOR,
        subjectType: 'scheduled_job',
        subjectId: definition.name,
        summary: `${definition.name} ${error instanceof ScheduledJobTimeoutError ? 'timed out' : 'failed'}: ${errorMessage(error).slice(0, 200)}`,
        severity: 'ATTENTION',
        consoleLink: `/platform/jobs/${encodeURIComponent(definition.name)}`,
        ...(run ? { dedupeKey: `job.failed:${run.id}` } : {})
      }
    ).catch((err: unknown) => app.log.error({ err, jobName: definition.name }, 'Failed to record job failure activity'));
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
