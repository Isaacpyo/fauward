import type { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { config } from '../config/index.js';

export async function registerRedis(app: FastifyInstance) {
  const redis = new Redis(config.redisUrl);
  app.decorate('redis', redis);
  app.addHook('onClose', async () => {
    await redis.quit();
  });
}