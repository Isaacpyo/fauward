import { buildApp } from './app.js';
import { startWorkers } from './queues/start-workers.js';
import { startTenantCacheSubscriber } from './services/tenant-cache.subscriber.js';

const app = await buildApp();
await startWorkers(app);
// Plan/feature override changes reach every instance (WP-1.4); a Redis outage here must not stop the API.
await startTenantCacheSubscriber(app).catch((err: unknown) => app.log.error({ err }, 'Tenant cache subscriber did not start'));

// Safety net: a stray rejected promise (e.g. a fire-and-forget background task
// like tracking notifications or agent-event enqueue) must never take the whole
// API down. Log it loudly and keep serving — Node 15+ would otherwise exit.
process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'unhandledRejection — keeping server alive');
});
process.on('uncaughtException', (err) => {
  app.log.error({ err }, 'uncaughtException — keeping server alive');
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info(`Server listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
