import type { FastifyInstance } from 'fastify';
import { agentQueue } from '../../queues/queues.js';
import type { AgentEvent } from './agent.types.js';

export type AgentSweepJob = {
  kind: 'sweep';
  runId: string;
  tenantId: string;
};

export async function enqueueAgentEvent(
  app: FastifyInstance,
  event: AgentEvent
): Promise<void> {
  try {
    await agentQueue.add(event.type, event as unknown as Record<string, unknown>, {
      jobId: event.eventId
    });
    app.log.info({ eventId: event.eventId, type: event.type }, 'agent event enqueued');
  } catch (err) {
    app.log.warn({ err, eventId: event.eventId }, 'agent event enqueue failed');
  }
}

export async function enqueueAgentSweep(
  app: FastifyInstance,
  args: { runId: string; tenantId: string }
): Promise<void> {
  const job: AgentSweepJob = { kind: 'sweep', runId: args.runId, tenantId: args.tenantId };
  try {
    await agentQueue.add('sweep', job, {
      jobId: `sweep-${args.runId}`,
      // A failed sweep records its own FAILED status on AiAgentRun. Retries would clobber it
      // and waste LLM budget; user can click Run agent again to retry.
      attempts: 1
    });
    app.log.info({ runId: args.runId, tenantId: args.tenantId }, 'agent sweep enqueued');
  } catch (err) {
    app.log.warn({ err, runId: args.runId }, 'agent sweep enqueue failed');
  }
}
