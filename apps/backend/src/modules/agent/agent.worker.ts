import { Worker, type Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';

import { AgentEventSchema } from './agent.schemas.js';
import { runAgent } from './agent.service.js';
import { persistAgentRun } from './agent.audit.js';
import { buildToolHandlers } from './agent.handlers.impl.js';

export const AGENT_QUEUE_NAME = 'fauward-agent-events';

let worker: Worker | null = null;

export function startAgentWorker(app: FastifyInstance) {
  if (worker) return worker;

  worker = new Worker(
    AGENT_QUEUE_NAME,
    async (job: Job) => {
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
