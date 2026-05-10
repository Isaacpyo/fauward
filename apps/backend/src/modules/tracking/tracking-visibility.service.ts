import type { TrackingEvent } from '@prisma/client';
import { type TrackingVisibility, getAllowedVisibilities, type VisibilityAccessLevel } from '@fauward/tracking-core';

export function filterEventsByVisibility<T extends Pick<TrackingEvent, 'visibility'>>(
  events: T[],
  level: VisibilityAccessLevel
): T[] {
  const allowed = new Set(getAllowedVisibilities(level) as string[]);
  return events.filter((e) => allowed.has(e.visibility));
}

export function defaultVisibilityForStatus(status: string): TrackingVisibility {
  const customerVisible: string[] = [
    'CREATED', 'BOOKED', 'LABEL_GENERATED', 'ASSIGNED',
    'PICKUP_SCHEDULED', 'PICKED_UP',
    'AT_ORIGIN_HUB', 'DEPARTED_ORIGIN_HUB',
    'IN_TRANSIT', 'AT_DESTINATION_HUB',
    'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED',
    'DELIVERED', 'FAILED_DELIVERY',
    'CUSTOMS_HOLD', 'CUSTOMS_RELEASED',
    'RETURN_STARTED', 'RETURNED', 'CANCELLED'
  ];

  const tenantInternal: string[] = [
    'EXCEPTION', 'STATUS_OVERRIDE'
  ];

  if (customerVisible.includes(status)) return 'CUSTOMER_VISIBLE';
  if (tenantInternal.includes(status)) return 'TENANT_INTERNAL';
  return 'TENANT_INTERNAL';
}
