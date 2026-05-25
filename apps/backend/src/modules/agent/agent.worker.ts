import { Worker, type Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';

import { runWithTenantContext } from '../../context/tenant.context.js';
import { AgentEventSchema } from './agent.schemas.js';
import { runAgent } from './agent.service.js';
import { runSweep } from './sweep.service.js';
import { persistAgentRun } from './agent.audit.js';
import { buildToolHandlers } from './agent.handlers.impl.js';

export const AGENT_QUEUE_NAME = 'fauward-agent-events';

let worker: Worker | null = null;

function isSweepJob(data: unknown): data is { kind: 'sweep'; runId: string; tenantId: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'kind' in data &&
    (data as { kind: unknown }).kind === 'sweep'
  );
}

export function startAgentWorker(app: FastifyInstance) {
  if (worker) return worker;

  worker = new Worker(
    AGENT_QUEUE_NAME,
    async (job: Job) => {
      if (isSweepJob(job.data)) {
        const { runId, tenantId } = job.data;
        // Workers run outside Fastify request scope, so the Prisma tenant plugin has no
        // context and blocks writes. Look up tenant fields and re-enter tenant context here.
        const tenant = await app.prisma.tenant.findFirst({
          where: { id: tenantId },
          select: { slug: true, plan: true, region: true }
        });
        if (!tenant) {
          app.log.error({ jobId: job.id, tenantId }, 'sweep job: tenant not found');
          return;
        }
        await runWithTenantContext(
          {
            tenantId,
            tenantSlug: tenant.slug,
            plan: tenant.plan,
            region: tenant.region ?? 'eu',
            isSuperAdmin: false
          },
          () => runSweep(app, runId, tenantId)
        );
        app.log.info({ jobId: job.id, runId }, 'agent sweep complete');
        return;
      }

      const parsed = AgentEventSchema.safeParse(job.data);
      if (!parsed.success) {
        app.log.error({ jobId: job.id, errors: parsed.error.flatten() }, 'invalid agent job payload');
        return;
      }

      const handlers = buildToolHandlers(app);
      const result = await runAgent(parsed.data, handlers, app.prisma, app.redis);
      await persistAgentRun(parsed.data, result);

      app.log.info({ jobId: job.id, runStatus: result.status }, 'agent job complete');
    },
    {
      connection: { host: process.env.REDIS_HOST ?? 'localhost', port: 6379 },
      concurrency: 5
    }
  );

  worker.on('failed', (job, err) => {
    app.log.error({ jobId: job?.id, err }, 'agent worker job failed');
  });

  return worker;
}

export async function stopAgentWorker() {
  if (!worker) return;
  await worker.close();
  worker = null;
}
