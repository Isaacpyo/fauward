import type { OutboxEvent } from '@prisma/client';
import type { ActivityInput } from './platform-activity.service.js';

// D7 projection: which OutboxEvents become console activity, and how. Only events a Fauward human should see are
// projected; routine shipment movement (every scan, every status hop) stays out of the feed because it would bury the
// signal (C60). The dedupe key is the outbox event id, so re-projecting an event never adds a second row.

type Payload = Record<string, unknown>;

function text(payload: Payload, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Shipment statuses that need attention; any other status update is not projected. */
const ATTENTION_STATUSES = new Set(['EXCEPTION', 'FAILED_DELIVERY']);

function tenantLink(tenantId: string | null) {
  return tenantId ? `/customer/360/${tenantId}?tab=activity` : null;
}

export function activityForOutboxEvent(event: Pick<OutboxEvent, 'id' | 'eventType' | 'aggregateId' | 'tenantId' | 'payload' | 'createdAt'>): ActivityInput | null {
  const payload: Payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? (event.payload as Payload) : {};
  const tenantId = event.tenantId ?? text(payload, 'tenantId');
  const base = {
    tenantId,
    dedupeKey: `outbox:${event.id}`,
    occurredAt: event.createdAt,
    consoleLink: tenantLink(tenantId)
  };
  const tracking = text(payload, 'trackingNumber') ?? event.aggregateId;

  switch (event.eventType) {
    case 'shipment.created':
      return {
        ...base,
        service: 'customer.360',
        type: 'shipment.created',
        actorType: 'TENANT_USER',
        actorLabel: 'Tenant',
        subjectType: 'shipment',
        subjectId: event.aggregateId,
        summary: `Shipment ${tracking} created`,
        metadata: { trackingNumber: tracking }
      };
    case 'shipment.status.updated': {
      const status = text(payload, 'status');
      if (!status || !ATTENTION_STATUSES.has(status)) return null;
      return {
        ...base,
        service: 'customer.360',
        type: 'shipment.attention',
        actorType: 'TENANT_USER',
        actorLabel: text(payload, 'source') === 'AGENT_APP' ? 'Field operator' : 'Tenant',
        subjectType: 'shipment',
        subjectId: event.aggregateId,
        summary: `Shipment ${tracking} moved to ${status.replace(/_/g, ' ').toLowerCase()}`,
        severity: 'ATTENTION',
        metadata: { trackingNumber: tracking, status }
      };
    }
    case 'shipment.rerouted':
      return {
        ...base,
        service: 'customer.360',
        type: 'shipment.rerouted_by_agent',
        actorType: 'SYSTEM',
        actorLabel: 'Fauward Agent',
        subjectType: 'shipment',
        subjectId: event.aggregateId,
        summary: `Fauward Agent reassigned shipment ${tracking}`,
        metadata: { trackingNumber: tracking, runId: text(payload, 'runId') }
      };
    case 'tenant.created':
      return {
        ...base,
        service: 'platform.tenants',
        type: 'tenant.created',
        actorType: 'TENANT_USER',
        actorLabel: 'Sign-up',
        subjectType: 'tenant',
        subjectId: event.aggregateId,
        summary: `New workspace ${text(payload, 'slug') ?? event.aggregateId} signed up`,
        consoleLink: `/platform/tenants/${event.aggregateId}`,
        metadata: { slug: text(payload, 'slug') }
      };
    case 'tenant.slug.changed':
      return {
        ...base,
        service: 'platform.tenants',
        type: 'tenant.slug_changed',
        actorType: 'TENANT_USER',
        actorLabel: 'Tenant admin',
        subjectType: 'tenant',
        subjectId: event.aggregateId,
        summary: `Workspace address changed from ${text(payload, 'oldSlug') ?? '?'} to ${text(payload, 'newSlug') ?? '?'}`,
        consoleLink: `/platform/tenants/${event.aggregateId}`,
        metadata: { oldSlug: text(payload, 'oldSlug'), newSlug: text(payload, 'newSlug') }
      };
    default:
      return null;
  }
}

/** Every activity type the projection can emit (the loop-map enumeration test reads this). */
export const OUTBOX_ACTIVITY_TYPES = ['shipment.created', 'shipment.attention', 'shipment.rerouted_by_agent', 'tenant.created', 'tenant.slug_changed'] as const;
