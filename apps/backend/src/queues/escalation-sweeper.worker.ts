import type { FastifyInstance } from 'fastify';
import { startEscalationSweeper } from '../modules/tracking/escalation/sweeper.worker.js';

let stopFn: (() => void) | null = null;

export function startEscalationSweeperWorker(app: FastifyInstance): void {
  if (stopFn) return;
  stopFn = startEscalationSweeper({
    prisma: app.prisma,
    redis: app.redis,
    onError: (err) => app.log.error({ err }, 'Escalation sweeper error'),
  });
}

export function stopEscalationSweeperWorker(): void {
  if (stopFn) {
    stopFn();
    stopFn = null;
  }
}
