import type { FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';

// platform.health (WP-3.7): every background worker writes `worker:<name>:heartbeat` (the beat time, TTL 60 s) every
// 20 s while it runs. A worker whose key expired — process down, worker closed or its probe failing — reads as not alive.

export const HEARTBEAT_INTERVAL_MS = 20_000;
export const HEARTBEAT_TTL_SECONDS = 60;

/** Workers started by start-workers.ts, in the order the health page lists them. */
export const KNOWN_WORKERS = [
  'outbox',
  'notification',
  'webhook',
  'analytics',
  'scheduled',
  'history-writer',
  'ws-publisher',
  'escalation-sweeper',
  'agent'
] as const;
export type WorkerName = (typeof KNOWN_WORKERS)[number];

export const heartbeatKey = (name: string) => `worker:${name}:heartbeat`;

type HeartbeatDeps = { redis: Pick<Redis, 'set'>; log: Pick<FastifyBaseLogger, 'error'>; now?: () => number };

export async function beat(deps: HeartbeatDeps, name: string) {
  await deps.redis.set(heartbeatKey(name), new Date(deps.now?.() ?? Date.now()).toISOString(), 'EX', HEARTBEAT_TTL_SECONDS);
}

/**
 * Starts the heartbeat for one worker. `isAlive` lets a worker report that it is not processing (for example a BullMQ
 * worker that closed); a false probe skips the beat so the key expires. Returns a stop function.
 */
export function startWorkerHeartbeat(deps: HeartbeatDeps, name: string, isAlive: () => boolean = () => true) {
  const tick = () => {
    if (!isAlive()) return;
    beat(deps, name).catch((err: unknown) => deps.log.error({ err, worker: name }, 'Failed to write worker heartbeat'));
  };
  tick();
  const timer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

export type WorkerStatus = { name: string; alive: boolean; lastBeat: string | null };

export async function readWorkerHeartbeats(redis: Pick<Redis, 'mget'>, now = Date.now()): Promise<WorkerStatus[]> {
  const values = await redis.mget(...KNOWN_WORKERS.map(heartbeatKey));
  return KNOWN_WORKERS.map((name, index) => {
    const raw = values[index];
    const at = raw ? Date.parse(raw) : Number.NaN;
    const lastBeat = Number.isFinite(at) ? new Date(at).toISOString() : null;
    return { name, alive: lastBeat !== null && now - at <= HEARTBEAT_TTL_SECONDS * 1000, lastBeat };
  });
}
