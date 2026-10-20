import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Queue } from 'bullmq';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { scheduledJobsQueue } from '../../../queues/queues.js';
import { findScheduledJob, listScheduledJobs, type ScheduledJobDefinition } from '../../../queues/scheduled-job-runner.js';
import { writePlatformAuditLog } from '../../../services/platform-audit.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { platformAuditActor, reasonOf } from '../request-meta.js';
// Importing the worker module registers every scheduled job definition (registerScheduledJob calls at module load).
import '../../../queues/scheduled.worker.js';

// platform.jobs (WP-3.8): registered scheduled jobs with next/last run, run history from ScheduledJobRun, and a
// dangerous manual trigger whose run row records the actor and reason.

type JobsQueue = Pick<Queue, 'add' | 'getRepeatableJobs'>;

const runsQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().uuid().optional() });
const triggerBody = z.object({ reason: z.string() });

type RunRow = { id: string; jobName: string; bullJobId: string | null; status: string; triggeredBy: string; reason: string | null; startedAt: Date; finishedAt: Date | null; durationMs: number | null; error: string | null; result: unknown };

function presentRun(row: RunRow) {
  return {
    id: row.id,
    jobName: row.jobName,
    bullJobId: row.bullJobId,
    status: row.status,
    triggeredBy: row.triggeredBy,
    reason: row.reason,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    error: row.error,
    result: row.result ?? null
  };
}

export async function registerConsoleJobRoutes(app: FastifyInstance, options: { queue?: JobsQueue; jobs?: () => ScheduledJobDefinition[] } = {}) {
  const queue: JobsQueue = options.queue ?? scheduledJobsQueue;
  const jobs = options.jobs ?? listScheduledJobs;
  const find = (name: string) => (options.jobs ? jobs().find((job) => job.name === name) : findScheduledJob(name));

  app.get('/api/internal/jobs', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.jobs.read')] }, async (request, reply) => {
    const definitions = jobs();
    const [repeatables, lastRuns] = await Promise.all([
      queue.getRepeatableJobs().catch((err: unknown) => {
        request.log.warn({ err }, 'Could not read repeatable jobs');
        return null;
      }),
      app.prisma.scheduledJobRun.findMany({
        where: { jobName: { in: definitions.map((job) => job.name) } },
        distinct: ['jobName'],
        orderBy: [{ jobName: 'asc' }, { startedAt: 'desc' }]
      })
    ]);
    const lastByName = new Map(lastRuns.map((run) => [run.jobName, run]));
    return reply.send({
      scheduleReadable: repeatables !== null,
      data: definitions
        .map((job) => {
          const repeatable = repeatables?.find((item) => item.name === job.name) ?? null;
          const last = lastByName.get(job.name);
          return {
            name: job.name,
            pattern: job.pattern,
            description: job.description,
            timeoutMs: job.timeoutMs,
            scheduled: repeatables === null ? null : repeatable !== null,
            nextRunAt: repeatable?.next ? new Date(repeatable.next).toISOString() : null,
            lastRun: last ? presentRun(last) : null
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    });
  });

  app.get('/api/internal/jobs/:name/runs', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.jobs.read')] }, async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!find(name)) return reply.status(404).send({ error: 'JOB_NOT_FOUND', message: `No scheduled job named ${name}` });
    const parsed = runsQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const rows = await app.prisma.scheduledJobRun.findMany({
      where: { jobName: name },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: parsed.data.limit + 1,
      ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {})
    });
    const hasMore = rows.length > parsed.data.limit;
    const page = hasMore ? rows.slice(0, parsed.data.limit) : rows;
    return reply.send({ data: page.map(presentRun), nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null });
  });

  app.post('/api/internal/jobs/:name/trigger', { preHandler: dangerous('platform.jobs.trigger') }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const parsed = triggerBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    const job = find(name);
    if (!job) return reply.status(404).send({ error: 'JOB_NOT_FOUND', message: `No scheduled job named ${name}` });
    const reason = reasonOf(request) ?? '';
    const actor = request.platform!.user;
    const bullJobId = `manual-${job.name}-${randomUUID()}`;
    await queue.add(job.name, { triggeredBy: actor.id, reason }, { jobId: bullJobId });
    await writePlatformAuditLog(app.prisma, { ...platformAuditActor(request), actorType: 'PLATFORM_USER', action: 'SCHEDULED_JOB_TRIGGERED', reason, metadata: { jobName: job.name, bullJobId } });
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: app.log },
      {
        service: 'platform.jobs',
        type: 'job.triggered',
        ...staffActor(request),
        subjectType: 'scheduled_job',
        subjectId: job.name,
        summary: `${job.name} run started by hand: ${reason}`,
        consoleLink: `/platform/jobs/${encodeURIComponent(job.name)}`,
        metadata: { bullJobId }
      }
    );
    return reply.status(202).send({ jobName: job.name, bullJobId, queued: true });
  });
}
