import type { FastifyInstance } from 'fastify';
import { agentQueue } from '../../queues/queues.js';
import type { AgentEvent } from './agent.types.js';

export async function enqueueAgentEvent(
  app: FastifyInstance,
  event: AgentEvent
): Promise<void> {
  try {
    await agentQueue.add(event.type, event, {
      jobId: event.eventId
    });
    app.log.info({ eventId: event.eventId, type: event.type }, 'agent event enqueued');
  } catch (err) {
    app.log.warn({ err, eventId: event.eventId }, 'agent event enqueue failed');
  }
}
