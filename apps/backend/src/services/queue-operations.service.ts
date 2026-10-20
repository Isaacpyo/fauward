import type { Job, Queue } from 'bullmq';
import { redactPlatformLogValue } from './platform-redaction.service.js';

// platform.queues (WP-3.6): live counts, job inspection, DLQ replay, clean and pause over the BullMQ queues. Routes talk
// to the `QueueBackend` interface so tests can run the same logic over in-memory queues.

export const QUEUE_JOB_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const;
export type QueueJobState = (typeof QUEUE_JOB_STATES)[number];
export type QueueListState = QueueJobState | 'dlq';
export type CleanableState = 'completed' | 'failed';

export type RawQueueJob = {
  id: string;
  name: string;
  data: Record<string, unknown>;
  attemptsMade: number;
  failedReason: string | null;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
};

export interface QueueBackend {
  readonly name: string;
  counts(): Promise<Record<QueueJobState, number>>;
  /** Jobs that reached `state` at or after `sinceMs` (BullMQ scores finished jobs by `finishedOn`). */
  finishedSince(state: CleanableState, sinceMs: number): Promise<number>;
  /** `finishedOn` of the newest completed job, or null when none is kept. */
  lastCompletedAt(): Promise<number | null>;
  isPaused(): Promise<boolean>;
  /** Newest first, inclusive range like BullMQ's getJobs. */
  list(state: QueueJobState, start: number, end: number): Promise<RawQueueJob[]>;
  get(id: string): Promise<RawQueueJob | null>;
  add(name: string, data: Record<string, unknown>): Promise<void>;
  remove(id: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Removes jobs in `state` older than `graceMs`; returns how many were removed. */
  clean(state: CleanableState, graceMs: number): Promise<number>;
}

/**
 * `job`: the dead-letter entry carries the original job data plus the metadata keys below and is replayed by adding the
 * original data back to the source queue. `outbox`: the entry records an OutboxEvent that failed to publish; the
 * event row itself stays unpublished and the outbox poller retries it, so replay clears the alert lock and the entry.
 */
export type DlqKind = 'job' | 'outbox';

export type QueueEntry = {
  name: string;
  backend: QueueBackend;
  dlq?: { backend: QueueBackend; kind: DlqKind };
  /** Job name used on replay when a dead-letter entry predates `jobName` being recorded. */
  defaultJobName?: string;
};

/** Keys the workers add when dead-lettering a job; stripped on replay so the source queue gets the original data. */
export const DLQ_METADATA_KEYS = ['queue', 'jobId', 'jobName', 'failedAt', 'reason', 'attemptsMade'] as const;

const MAX_LISTED = 2_000;
export const QUEUE_PAGE_SIZE = 50;

function toRawJob(job: Job): RawQueueJob {
  const data = job.data && typeof job.data === 'object' && !Array.isArray(job.data) ? (job.data as Record<string, unknown>) : {};
  return {
    id: String(job.id ?? ''),
    name: job.name,
    data,
    attemptsMade: job.attemptsMade ?? 0,
    failedReason: job.failedReason ?? null,
    timestamp: job.timestamp,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null
  };
}

/** Adapter over a real BullMQ queue. */
export function bullQueueBackend(queue: Queue): QueueBackend {
  return {
    name: queue.name,
    async counts() {
      const counts = await queue.getJobCounts(...QUEUE_JOB_STATES, 'paused', 'prioritized', 'waiting-children');
      return {
        waiting: (counts.waiting ?? 0) + (counts.paused ?? 0) + (counts.prioritized ?? 0) + (counts['waiting-children'] ?? 0),
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0
      };
    },
    async finishedSince(state, sinceMs) {
      const client = await queue.client;
      return client.zcount(queue.toKey(state), sinceMs, '+inf');
    },
    async lastCompletedAt() {
      const client = await queue.client;
      const newest = await client.zrevrange(queue.toKey('completed'), 0, 0, 'WITHSCORES');
      const score = newest[1];
      return score === undefined ? null : Number(score);
    },
    isPaused: () => queue.isPaused(),
    async list(state, start, end) {
      const jobs = await queue.getJobs([state], start, end, false);
      return jobs.filter((job): job is Job => Boolean(job)).map(toRawJob);
    },
    async get(id) {
      const job = await queue.getJob(id);
      return job ? toRawJob(job) : null;
    },
    async add(name, data) {
      await queue.add(name, data);
    },
    async remove(id) {
      await queue.remove(id);
    },
    pause: () => queue.pause(),
    resume: () => queue.resume(),
    async clean(state, graceMs) {
      const removed = await queue.clean(graceMs, 10_000, state);
      return removed.length;
    }
  };
}

export type QueueSummary = {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  completed1h: number;
  failed1h: number;
  dlqDepth: number | null;
  throughputPerMin: number;
  lastProcessedAt: string | null;
  paused: boolean;
};

async function dlqDepth(entry: QueueEntry) {
  if (!entry.dlq) return null;
  const counts = await entry.dlq.backend.counts();
  // Dead-letter queues have no worker: entries sit in waiting (or delayed/failed if someone retried them by hand).
  return counts.waiting + counts.delayed + counts.active + counts.failed;
}

export async function summariseQueue(entry: QueueEntry, now = Date.now()): Promise<QueueSummary> {
  const backend = entry.backend;
  const [counts, completed1h, failed1h, completed5m, lastCompletedAt, paused, dlq] = await Promise.all([
    backend.counts(),
    backend.finishedSince('completed', now - 3_600_000),
    backend.finishedSince('failed', now - 3_600_000),
    backend.finishedSince('completed', now - 300_000),
    backend.lastCompletedAt(),
    backend.isPaused(),
    dlqDepth(entry)
  ]);
  return {
    name: entry.name,
    waiting: counts.waiting,
    active: counts.active,
    delayed: counts.delayed,
    completed1h,
    failed1h,
    dlqDepth: dlq,
    throughputPerMin: Math.round((completed5m / 5) * 10) / 10,
    lastProcessedAt: lastCompletedAt === null ? null : new Date(lastCompletedAt).toISOString(),
    paused
  };
}

export type QueueJobView = {
  id: string;
  name: string;
  state: QueueListState;
  attemptsMade: number;
  failedReason: string | null;
  createdAt: string;
  processedAt: string | null;
  finishedAt: string | null;
  /** Job data with secrets, tokens, emails and phone numbers masked (platform-redaction.service). */
  data: unknown;
};

const iso = (ms: number | null) => (ms === null || !Number.isFinite(ms) ? null : new Date(ms).toISOString());

export function presentJob(job: RawQueueJob, state: QueueListState): QueueJobView {
  const deadLetter = state === 'dlq';
  const failedReason = deadLetter ? (typeof job.data.reason === 'string' ? job.data.reason : typeof job.data.error === 'string' ? job.data.error : null) : job.failedReason;
  return {
    id: job.id,
    name: deadLetter && typeof job.data.jobName === 'string' ? job.data.jobName : job.name,
    state,
    attemptsMade: deadLetter && typeof job.data.attemptsMade === 'number' ? job.data.attemptsMade : job.attemptsMade,
    failedReason,
    createdAt: iso(job.timestamp) ?? new Date(0).toISOString(),
    processedAt: iso(job.processedOn),
    finishedAt: iso(job.finishedOn),
    data: redactPlatformLogValue(job.data)
  };
}

/** One page of jobs; `cursor` is the offset of the next page (BullMQ lists are index-ranged). */
export async function listQueueJobs(entry: QueueEntry, state: QueueListState, cursor: number, pageSize = QUEUE_PAGE_SIZE) {
  const backend = state === 'dlq' ? entry.dlq?.backend : entry.backend;
  if (!backend) return { data: [], nextCursor: null };
  const rawState: QueueJobState = state === 'dlq' ? 'waiting' : state;
  const rows = await backend.list(rawState, cursor, cursor + pageSize);
  const page = rows.slice(0, pageSize);
  return {
    data: page.map((row) => presentJob(row, state)),
    nextCursor: rows.length > pageSize ? String(cursor + pageSize) : null
  };
}

function originalData(data: Record<string, unknown>) {
  const copy: Record<string, unknown> = { ...data };
  for (const key of DLQ_METADATA_KEYS) delete copy[key];
  return copy;
}

export type ReplayResult = { requested: number; replayed: number; missing: string[] };

type OutboxReplayDeps = {
  /** Clears the 24 h dead-letter alert lock so a renewed failure alerts again. */
  clearOutboxLock(outboxEventId: string): Promise<void>;
};

/**
 * Moves dead-letter entries back to the source queue with their original data. `jobIds` empty = every entry (up to
 * 2,000 per call). Each entry is added to the source queue before it is removed from the DLQ, so a crash in between
 * leaves a duplicate rather than a lost job (jobs are idempotent, architecture §10).
 */
export async function replayDeadLetters(entry: QueueEntry, jobIds: string[] | undefined, deps: OutboxReplayDeps): Promise<ReplayResult> {
  const dlq = entry.dlq;
  if (!dlq) return { requested: 0, replayed: 0, missing: [] };
  const targets: RawQueueJob[] = [];
  const missing: string[] = [];
  if (jobIds && jobIds.length > 0) {
    for (const id of jobIds) {
      const job = await dlq.backend.get(id);
      if (job) targets.push(job);
      else missing.push(id);
    }
  } else {
    targets.push(...(await dlq.backend.list('waiting', 0, MAX_LISTED - 1)));
  }

  let replayed = 0;
  for (const job of targets) {
    if (dlq.kind === 'outbox') {
      const outboxEventId = typeof job.data.outboxEventId === 'string' ? job.data.outboxEventId : null;
      if (outboxEventId) await deps.clearOutboxLock(outboxEventId);
    } else {
      const name = typeof job.data.jobName === 'string' && job.data.jobName ? job.data.jobName : entry.defaultJobName ?? entry.name;
      await entry.backend.add(name, originalData(job.data));
    }
    await dlq.backend.remove(job.id);
    replayed += 1;
  }
  return { requested: jobIds && jobIds.length > 0 ? jobIds.length : targets.length, replayed, missing };
}
