import type { FastifyBaseLogger } from 'fastify';
import type { PlatformActivity, PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { ACTIVITY_CHANNEL } from './platform-activity.service.js';

export type ActivityListener = (activity: PlatformActivity) => void;

type HubDeps = {
  redis: Pick<Redis, 'duplicate'>;
  prisma: Pick<PrismaClient, 'platformActivity'>;
  log: Pick<FastifyBaseLogger, 'error' | 'warn'>;
};

type Subscriber = Pick<Redis, 'subscribe' | 'on' | 'quit'>;

/**
 * One Redis subscription per backend instance for the console activity stream (D7). `recordActivity` producers publish
 * the row id on `console:activity`; the hub loads the row once and hands it to every connected SSE client, each of which
 * applies the caller's own permission filter.
 */
export class ActivityStreamHub {
  private readonly listeners = new Set<ActivityListener>();
  private subscriber: Subscriber | null = null;

  constructor(private readonly deps: HubDeps) {}

  get size() {
    return this.listeners.size;
  }

  subscribe(listener: ActivityListener): () => void {
    this.listeners.add(listener);
    this.ensureSubscribed();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.close();
    };
  }

  /** Loads a published activity id and fans it out (exported for tests and for in-process producers). */
  async dispatch(activityId: string) {
    const activity = await this.deps.prisma.platformActivity.findUnique({ where: { id: activityId } });
    if (!activity) return;
    for (const listener of this.listeners) {
      try {
        listener(activity);
      } catch (err) {
        this.deps.log.error({ err, activityId }, 'Activity stream listener failed');
      }
    }
  }

  private ensureSubscribed() {
    if (this.subscriber) return;
    const subscriber: Subscriber = this.deps.redis.duplicate();
    this.subscriber = subscriber;
    subscriber.on('message', (channel: string, message: string) => {
      if (channel !== ACTIVITY_CHANNEL) return;
      this.dispatch(message).catch((err: unknown) => this.deps.log.error({ err, activityId: message }, 'Failed to dispatch console activity'));
    });
    subscriber.on('error', (err: unknown) => this.deps.log.warn({ err }, 'Console activity subscriber error'));
    subscriber.subscribe(ACTIVITY_CHANNEL).catch((err: unknown) => this.deps.log.error({ err }, 'Failed to subscribe to console activity'));
  }

  private close() {
    const subscriber = this.subscriber;
    this.subscriber = null;
    subscriber?.quit().catch((err: unknown) => this.deps.log.warn({ err }, 'Failed to close console activity subscriber'));
  }
}
