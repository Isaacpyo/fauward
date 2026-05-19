export interface IngestPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  ts: string; // ISO8601
  status?: string;
}

export interface IngestInput {
  shipmentId: string;
  idempotencyKey: string;
  points: IngestPoint[];
  source: 'driver' | 'webhook' | 'manual' | 'system';
  sourceRef?: string;
}

export interface IngestResult {
  accepted: number;
  dropped: number;
  latestSeq: bigint;
}

export interface StreamEvent {
  shipmentId: string;
  trackingNumber: string;
  seq: bigint;
  eventType: 'location' | 'status' | 'flag' | 'unflag';
  lat?: number;
  lng?: number;
  accuracyM?: number;
  status?: string;
  source: string;
  sourceRef?: string;
  occurredAt: string;
}

export interface EscalationStreamEvent {
  tenantId: string;
  shipmentId: string;
  trackingNumber: string;
  reason: string;
  flaggedAt: string;
}

export interface HotState {
  lat?: string;
  lng?: string;
  accuracyM?: string;
  status?: string;
  lastSeenAt?: string;
  seq: string;
  driverId?: string;
  escalationFlag?: string;
}

export interface ManualActionInput {
  shipmentId: string;
  action: 'status' | 'flag' | 'unflag';
  status?: string;
  reason?: string;
  idempotencyKey: string;
}
