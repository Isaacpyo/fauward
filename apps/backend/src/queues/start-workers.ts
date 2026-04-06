import type { FastifyInstance } from 'fastify';

import { startOutboxWorker } from './outbox.worker.js';
import { startNotificationWorker } from '../modules/notifications/notifications.worker.js';

export function startWorkers(app: FastifyInstance) {
  startOutboxWorker(app);
  startNotificationWorker(app);
}
