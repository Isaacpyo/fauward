import type { FastifyInstance } from 'fastify';

import { startOutboxWorker, stopOutboxWorker } from './outbox.worker.js';
import { startAnalyticsWorker, stopAnalyticsWorker } from './analytics.worker.js';
import { startScheduledWorker, stopScheduledWorker } from './scheduled.worker.js';
import { startNotificationWorker, stopNotificationWorker } from '../modules/notifications/notifications.worker.js';
import { startWebhookWorker, stopWebhookWorker } from './webhook.worker.js';
import { startHistoryWriterWorker, stopHistoryWriterWorker } from './history-writer.worker.js';
import { startWsPublisherWorker, stopWsPublisherWorker } from './ws-publisher.worker.js';
import { startEscalationSweeperWorker, stopEscalationSweeperWorker } from './escalation-sweeper.worker.js';
import { startAgentWorker, stopAgentWorker } from '../modules/agent/agent.worker.js';

export async function startWorkers(app: FastifyInstance) {
  startOutboxWorker(app);
  startNotificationWorker(app);
  startWebhookWorker(app);
  startAnalyticsWorker(app);
  await startScheduledWorker(app);
  startHistoryWriterWorker(app);
  startWsPublisherWorker(app);
  startEscalationSweeperWorker(app);
  startAgentWorker(app);
  app.addHook('onClose', async () => {
    await stopOutboxWorker();
    await stopAnalyticsWorker();
    await stopScheduledWorker();
    await stopNotificationWorker();
    await stopWebhookWorker();
    await stopHistoryWriterWorker();
    await stopWsPublisherWorker();
    stopEscalationSweeperWorker();
    await stopAgentWorker();
  });
}
