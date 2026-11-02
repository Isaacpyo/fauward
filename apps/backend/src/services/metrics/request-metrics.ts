import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type Redis from 'ioredis';

// platform.health (WP-3.7): HTTP latency and 5xx rate per route group in Redis minute buckets. Durations go into fixed
// histogram buckets (upper bounds below, HDR-style) so percentiles can be merged across minutes and instances. Each
// instance accumulates in memory and flushes every few seconds; minute hashes expire after 24 h.

/** Upper bounds (ms) of the latency buckets; the last bucket is open-ended and reported as its lower bound. */
export const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1_000, 1_500, 2_000, 3_000, 5_000, 10_000] as const;
const OPEN_BUCKET = LATENCY_BUCKETS_MS.length;
export const METRICS_RETENTION_SECONDS = 24 * 60 * 60;
export const METRICS_FLUSH_MS = 5_000;
/** Group that totals every request. */
export const ALL_ROUTES = '*';

export const minuteKey = (minute: number) => `metrics:http:${minute}`;
export const minuteOf = (ms: number) => Math.floor(ms / 60_000);

export function bucketIndex(durationMs: number) {
  const index = LATENCY_BUCKETS_MS.findIndex((bound) => durationMs <= bound);
  return index === -1 ? OPEN_BUCKET : index;
}

/**
 * Route group: the first two path segments of the matched route template, after the `/api/<namespace>` prefix when
 * there is one (`/api/v1/shipments/:id/events` → `/api/v1/shipments`, `/health` → `/health`). Unmatched requests
 * (404s) share one group so arbitrary URLs cannot create unbounded keys.
 */
export function routeGroup(routeTemplate: string | undefined) {
  if (!routeTemplate) return 'unmatched';
  const segments = routeTemplate.split('?')[0].split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  const take = segments[0] === 'api' ? 3 : 2;
  return `/${segments.slice(0, take).join('/')}`;
}

type Counter = Map<string, number>;

export class RequestMetricsRecorder {
  private pending = new Map<number, Counter>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: { redis: Pick<Redis, 'pipeline'>; log: Pick<FastifyBaseLogger, 'error'>; now?: () => number }) {}

  record(group: string, durationMs: number, statusCode: number, at = this.deps.now?.() ?? Date.now()) {
    const minute = minuteOf(at);
    let counter = this.pending.get(minute);
    if (!counter) {
      counter = new Map();
      this.pending.set(minute, counter);
    }
    const bucket = bucketIndex(durationMs);
    for (const name of group === ALL_ROUTES ? [ALL_ROUTES] : [group, ALL_ROUTES]) {
      counter.set(`${name}|n`, (counter.get(`${name}|n`) ?? 0) + 1);
      counter.set(`${name}|b${bucket}`, (counter.get(`${name}|b${bucket}`) ?? 0) + 1);
      if (statusCode >= 500) counter.set(`${name}|5xx`, (counter.get(`${name}|5xx`) ?? 0) + 1);
    }
  }

  /** Writes the accumulated counts with HINCRBY; on failure the batch is dropped and logged (metrics never fail requests). */
  async flush() {
    if (this.pending.size === 0) return;
    const batch = this.pending;
    this.pending = new Map();
    const pipeline = this.deps.redis.pipeline();
    for (const [minute, counter] of batch) {
      const key = minuteKey(minute);
      for (const [field, value] of counter) pipeline.hincrby(key, field, value);
      pipeline.expire(key, METRICS_RETENTION_SECONDS);
    }
    await pipeline.exec();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush().catch((err: unknown) => this.deps.log.error({ err }, 'Failed to flush request metrics'));
    }, METRICS_FLUSH_MS);
    this.timer.unref();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }
}

/** Registers the onResponse hook and the flush timer. Health checks and the metrics endpoints themselves are included. */
export function registerRequestMetrics(app: FastifyInstance) {
  const recorder = new RequestMetricsRecorder({ redis: app.redis, log: app.log });
  app.addHook('onResponse', async (request, reply) => {
    recorder.record(routeGroup(request.routeOptions?.url), reply.elapsedTime, reply.statusCode);
  });
  app.addHook('onReady', async () => recorder.start());
  app.addHook('onClose', async () => {
    await recorder.stop().catch((err: unknown) => app.log.error({ err }, 'Failed to flush request metrics on close'));
  });
  return recorder;
}

export type LatencySummary = { p50: number; p95: number; p99: number; count: number; errorRate5xx: number; rpm: number };

type GroupAccumulator = { count: number; errors: number; buckets: number[] };

function percentile(buckets: number[], count: number, p: number) {
  const target = Math.ceil(count * p);
  let seen = 0;
  for (let index = 0; index < buckets.length; index += 1) {
    seen += buckets[index] ?? 0;
    if (seen >= target) return index === OPEN_BUCKET ? LATENCY_BUCKETS_MS[OPEN_BUCKET - 1] : LATENCY_BUCKETS_MS[index];
  }
  return LATENCY_BUCKETS_MS[OPEN_BUCKET - 1];
}

function summarise(group: GroupAccumulator, minutes: number): LatencySummary {
  return {
    p50: percentile(group.buckets, group.count, 0.5),
    p95: percentile(group.buckets, group.count, 0.95),
    p99: percentile(group.buckets, group.count, 0.99),
    count: group.count,
    errorRate5xx: group.count === 0 ? 0 : Math.round((group.errors / group.count) * 10_000) / 10_000,
    rpm: Math.round((group.count / minutes) * 10) / 10
  };
}

/**
 * Reads the last `minutes` complete-or-current minute buckets. Returns null overall when nothing was recorded (the
 * caller reports "no traffic recorded" rather than zeros).
 */
export async function readRequestMetrics(redis: Pick<Redis, 'hgetall'>, options: { minutes?: number; now?: number } = {}) {
  const minutes = options.minutes ?? 15;
  const current = minuteOf(options.now ?? Date.now());
  const hashes = await Promise.all(Array.from({ length: minutes }, (_unused, offset) => redis.hgetall(minuteKey(current - offset))));
  const groups = new Map<string, GroupAccumulator>();
  for (const hash of hashes) {
    for (const [field, raw] of Object.entries(hash ?? {})) {
      const separator = field.lastIndexOf('|');
      if (separator <= 0) continue;
      const name = field.slice(0, separator);
      const kind = field.slice(separator + 1);
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      let group = groups.get(name);
      if (!group) {
        group = { count: 0, errors: 0, buckets: Array.from({ length: OPEN_BUCKET + 1 }, () => 0) };
        groups.set(name, group);
      }
      if (kind === 'n') group.count += value;
      else if (kind === '5xx') group.errors += value;
      else if (kind.startsWith('b')) {
        const index = Number(kind.slice(1));
        if (Number.isInteger(index) && index >= 0 && index <= OPEN_BUCKET) group.buckets[index] += value;
      }
    }
  }
  const total = groups.get(ALL_ROUTES);
  if (!total || total.count === 0) return null;
  const routes = [...groups.entries()]
    .filter(([name]) => name !== ALL_ROUTES)
    .map(([name, group]) => ({ group: name, ...summarise(group, minutes) }))
    .sort((a, b) => b.p95 - a.p95 || b.count - a.count);
  return { windowMinutes: minutes, http: summarise(total, minutes), routes };
}
