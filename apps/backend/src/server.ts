import { buildApp } from './app.js';
import { startWorkers } from './queues/start-workers.js';

const app = await buildApp();
await startWorkers(app);

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info(`Server listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
