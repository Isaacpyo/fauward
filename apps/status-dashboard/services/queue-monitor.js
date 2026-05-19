import { QUEUES, THRESHOLDS } from './registry.js';

const queueState = new Map();
const BACKEND_URL = process.env.BACKEND_URL ?? (process.env.VERCEL ? null : 'http://localhost:3001');
const MONITORING_KEY = process.env.MONITORING_API_KEY ?? '';

for (const q of QUEUES) {
  queueState.set(q.id, {
    ...q,
    status:           'checking',
    depth:            null,
    active:           null,
    failed:           null,
    delayed:          null,
    workerCount:      null,
    oldestJobAgeSecs: null,
    lastChecked:      null,
    error:            null,
    isMock:           false,
  });
}

export function getQueueState() {
  return Array.from(queueState.values());
}

function deriveStatus(stats) {
  if (!stats) return 'unknown';
  if (stats.failed >= THRESHOLDS.queueFailedCritical) return 'down';
  if (
    stats.failed          >= THRESHOLDS.queueFailedWarning  ||
    stats.depth           >= THRESHOLDS.queueDepthWarning   ||
    (stats.oldestJobAgeSecs != null && stats.oldestJobAgeSecs >= THRESHOLDS.oldestJobWarningSecs)
  ) return 'degraded';
  return 'up';
}

export async function refreshQueueStats() {
  if (!BACKEND_URL) {
    markAllUnknown('BACKEND_URL not configured');
    return;
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (MONITORING_KEY) headers['Authorization'] = `Bearer ${MONITORING_KEY}`;

    const res = await fetch(`${BACKEND_URL}/api/internal/metrics/queues`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      markAllUnknown(`HTTP ${res.status}`);
      return;
    }

    const data = await res.json();

    for (const item of data.queues ?? []) {
      const def = QUEUES.find(q => q.id === item.id);
      if (!def) continue;

      const stats = item.stats;
      queueState.set(item.id, {
        ...def,
        status:           stats ? deriveStatus(stats) : 'unknown',
        depth:            stats?.depth            ?? null,
        active:           stats?.active           ?? null,
        failed:           stats?.failed           ?? null,
        delayed:          stats?.delayed          ?? null,
        workerCount:      stats?.workerCount      ?? null,
        oldestJobAgeSecs: stats?.oldestJobAgeSecs ?? null,
        lastChecked:      new Date().toISOString(),
        error:            stats ? null : 'Stats unavailable',
        isMock:           false,
      });
    }
  } catch (err) {
    markAllUnknown(err.message);
  }
}

function markAllUnknown(reason) {
  for (const q of QUEUES) {
    const prev = queueState.get(q.id);
    queueState.set(q.id, { ...prev, status: 'unknown', error: reason, lastChecked: new Date().toISOString() });
  }
}
