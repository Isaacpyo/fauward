import { buildApp } from './app.js';
import { startWorkers } from './queues/start-workers.js';

const app = await buildApp();
await startWorkers(app);

// Safety net: a stray rejected promise (e.g. a fire-and-forget background task
// like tracking notifications or agent-event enqueue) must never take the whole
// API down. Log it loudly and keep serving — Node 20 would otherwise exit.
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
