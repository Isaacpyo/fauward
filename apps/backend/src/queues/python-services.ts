import type { FastifyInstance } from 'fastify';

export async function publishPythonServiceJob(
  app: FastifyInstance,
  queueName: string,
  payload: Record<string, unknown>
) {
  try {
    await app.redis.lpush(queueName, JSON.stringify(payload));
  } catch (error) {
    app.log.warn({ err: error, queueName }, 'Failed to publish Python service job');
  }
}
