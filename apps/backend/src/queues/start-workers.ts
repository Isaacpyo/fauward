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
import { startWorkerHeartbeat, type WorkerName } from '../services/metrics/worker-heartbeat.js';

export async function startWorkers(app: FastifyInstance) {
  // platform.health (WP-3.7): each worker beats every 20 s while it runs; BullMQ workers beat only while running.
  const heartbeats: Array<() => void> = [];
  const heartbeat = (name: WorkerName, worker?: { isRunning(): boolean }) =>
    heartbeats.push(startWorkerHeartbeat({ redis: app.redis, log: app.log }, name, worker ? () => worker.isRunning() : undefined));

  startOutboxWorker(app);
  heartbeat('outbox');
  heartbeat('notification', startNotificationWorker(app));
  heartbeat('webhook', startWebhookWorker(app));
  heartbeat('analytics', startAnalyticsWorker(app));
  heartbeat('scheduled', await startScheduledWorker(app));
  startHistoryWriterWorker(app).catch((err: unknown) => app.log.error({ err }, 'History writer worker failed to start'));
  heartbeat('history-writer');
  startWsPublisherWorker(app).catch((err: unknown) => app.log.error({ err }, 'WS publisher worker failed to start'));
  heartbeat('ws-publisher');
  startEscalationSweeperWorker(app);
  heartbeat('escalation-sweeper');
  heartbeat('agent', startAgentWorker(app));
  app.addHook('onClose', async () => {
    for (const stop of heartbeats) stop();
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
