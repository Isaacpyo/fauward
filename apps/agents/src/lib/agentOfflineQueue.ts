export type OfflineAdvanceAction = {
  id: string;
  trackingRef: string;
  location: string;
  notes: string;
  createdAt: number;
};

export type OfflineScanAction = {
  id: string;
  trackingRef: string;
  createdAt: number;
};

const ADVANCE_QUEUE_KEY = "agentAdvanceQueue";
const SCAN_QUEUE_KEY = "agentScanQueue";
const MAX_QUEUE = 10;

function safeParse<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function saveQueue<T>(key: string, queue: T[]) {
  const capped = queue.slice(-MAX_QUEUE);
  localStorage.setItem(key, JSON.stringify(capped));
  return capped;
}

export function loadAdvanceQueue(): OfflineAdvanceAction[] {
  return safeParse<OfflineAdvanceAction>(localStorage.getItem(ADVANCE_QUEUE_KEY));
}

export function enqueueAdvance(action: Omit<OfflineAdvanceAction, "id" | "createdAt">) {
  const queue = loadAdvanceQueue();
  queue.push({
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now()
  });
  return saveQueue<OfflineAdvanceAction>(ADVANCE_QUEUE_KEY, queue);
}

export function peekAdvanceQueue(): OfflineAdvanceAction | null {
  const queue = loadAdvanceQueue();
  return queue.length ? queue[0] : null;
}

export function shiftAdvanceQueue() {
  const queue = loadAdvanceQueue();
  queue.shift();
  return saveQueue<OfflineAdvanceAction>(ADVANCE_QUEUE_KEY, queue);
}

export function loadScanQueue(): OfflineScanAction[] {
  return safeParse<OfflineScanAction>(localStorage.getItem(SCAN_QUEUE_KEY));
}

export function enqueueScan(trackingRef: string) {
  const queue = loadScanQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trackingRef,
    createdAt: Date.now()
  });
  return saveQueue<OfflineScanAction>(SCAN_QUEUE_KEY, queue);
}

export function peekScanQueue(): OfflineScanAction | null {
  const queue = loadScanQueue();
  return queue.length ? queue[0] : null;
}

export function shiftScanQueue() {
  const queue = loadScanQueue();
  queue.shift();
  return saveQueue<OfflineScanAction>(SCAN_QUEUE_KEY, queue);
}