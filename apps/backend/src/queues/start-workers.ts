import type { FastifyInstance } from 'fastify';

import { startOutboxWorker, stopOutboxWorker } from './outbox.worker.js';
import { startAnalyticsWorker, stopAnalyticsWorker } from './analytics.worker.js';
import { startScheduledWorker, stopScheduledWorker } from './scheduled.worker.js';
import { startNotificationWorker, stopNotificationWorker } from '../modules/notifications/notifications.worker.js';
import { startWebhookWorker, stopWebhookWorker } from './webhook.worker.js';

export async function startWorkers(app: FastifyInstance) {
  startOutboxWorker(app);
  startNotificationWorker(app);
  startWebhookWorker(app);
  startAnalyticsWorker(app);
  await startScheduledWorker(app);
  app.addHook('onClose', async () => {
    await stopOutboxWorker();
    await stopAnalyticsWorker();
    await stopScheduledWorker();
    await stopNotificationWorker();
    await stopWebhookWorker();
  });
}
