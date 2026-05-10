import type { TrackingStatus } from './statuses.js';
import type { TrackingEventType } from './events.js';
import type { TrackingVisibility } from './visibility.js';
import type { TrackingSource, TrackingActorType } from './sources.js';

export interface TrackingEventData {
  id: string;
  tenantId: string;
  shipmentId: string;
  trackingNumber: string;
  eventType: TrackingEventType;
  status: TrackingStatus;
  title: string;
  description: string | null;
  source: TrackingSource;
  actorType: TrackingActorType;
  actorId: string | null;
  visibility: TrackingVisibility;
  locationName: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  metadata: Record<string, unknown> | null;
  idempotencyKey: string | null;
  occurredAt: Date;
  createdAt: Date;
}

export interface TrackingSnapshotData {
  id: string;
  tenantId: string;
  shipmentId: string;
  trackingNumber: string;
  currentStatus: TrackingStatus;
  operationalStatus: TrackingStatus;
  customerStatus: string;
  currentTitle: string;
  currentMessage: string | null;
  lastEventId: string | null;
  lastEventAt: Date | null;
  originName: string | null;
  destinationName: string | null;
  estimatedDeliveryAt: Date | null;
  deliveredAt: Date | null;
  hasException: boolean;
  exceptionCode: string | null;
  exceptionMessage: string | null;
  assignedDriverId: string | null;
  assignedVehicleId: string | null;
  podAvailable: boolean;
  updatedAt: Date;
}

export interface PublicTrackingTimelineEvent {
  title: string;
  description: string;
  occurredAt: string;
}

export interface PublicTrackingResponse {
  trackingNumber: string;
  tenant: {
    name: string;
    logoUrl: string | null;
  };
  status: string;
  message: string;
  estimatedDeliveryAt: string | null;
  destination: {
    city: string | null;
    country: string | null;
  };
  timeline: PublicTrackingTimelineEvent[];
}

export interface CreateTrackingEventInput {
  tenantId: string;
  shipmentId: string;
  trackingNumber: string;
  eventType: TrackingEventType;
  status: TrackingStatus;
  title: string;
  description?: string;
  source: TrackingSource;
  actorType: TrackingActorType;
  actorId?: string;
  visibility: TrackingVisibility;
  locationName?: string;
  city?: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  occurredAt?: Date;
  overrideReason?: string;
  skipTransitionCheck?: boolean;
}

export interface FieldSyncEvent {
  clientEventId: string;
  shipmentId: string;
  trackingNumber: string;
  status: TrackingStatus;
  eventType: TrackingEventType;
  title: string;
  description?: string;
  locationName?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  idempotencyKey: string;
  occurredAt: string;
}

export interface FieldSyncResult {
  accepted: Array<{ clientEventId: string; serverEventId: string }>;
  rejected: Array<{ clientEventId: string; reason: string }>;
}
