import { buildApp } from './app.js';
import { startWorkers } from './queues/start-workers.js';
import { runOverdueInvoiceSweep } from './modules/finance/finance.routes.js';

const app = await buildApp();
startWorkers(app);

setInterval(() => {
  runOverdueInvoiceSweep(app).catch((error) => {
    app.log.error({ error }, 'Overdue invoice sweep failed');
  });
}, 24 * 60 * 60 * 1000);

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info(`Server listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
