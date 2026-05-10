# Fauward Unified Tracking Core

> **Do not create separate tracking truth per portal.** All tracking updates must go through Tracking Core. Portals may have independent UIs and filtered views, but `TrackingEvent` and `TrackingSnapshot` remain the source of truth.

---

## Overview

The Tracking Core provides a single, shared tracking system consumed by all Fauward portals:

| Portal | Access Level | API Prefix |
|---|---|---|
| Tenant Portal | `tenant` | `/api/v1/tenant/tracking` |
| Superadmin | `platform` | `/api/v1/platform/tracking` |
| Customer / Public | `customer` | `/api/v1/tracking/:trackingNumber` |
| Fauward Go | `field` | `/api/v1/go/` |
| Carrier Webhooks | `system` | Via `CARRIER_WEBHOOK` source |
| AI Agent | `system` | Via `AI_AGENT` source |

---

## Architecture

```
TrackingEvent (append-only ledger)
     │
     ▼
TrackingSnapshot (fast read model — one per shipment)
     │
     ▼
Portal-Specific Tracking Views (filtered by visibility)
```

- **TrackingEvent** — immutable record of what happened and when
- **TrackingSnapshot** — derived current state, updated on every new event
- **TrackingView** — what a given portal/user is allowed to see

---

## Data Models

### TrackingEvent

The permanent, append-only event ledger.

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUID |
| `tenantId` | string | Tenant isolation |
| `shipmentId` | string | FK to Shipment |
| `trackingNumber` | string | Denormalised for fast lookup |
| `eventType` | `TrackingEventType` | See enum below |
| `status` | `TrackingStatus` | New canonical status |
| `title` | string | Human-readable title |
| `description` | string? | Optional detail |
| `source` | `TrackingSource` | Which system created this |
| `actorType` | `TrackingActorType` | Who performed the action |
| `actorId` | string? | User/system ID |
| `visibility` | `TrackingVisibility` | Controls which portals see this |
| `locationName` | string? | Free-text location |
| `city` / `region` / `country` | string? | Structured location |
| `lat` / `lng` | decimal? | GPS coordinates |
| `metadata` | JSON? | Extra data |
| `idempotencyKey` | string? | Deduplication key |
| `occurredAt` | DateTime | When it actually happened |
| `createdAt` | DateTime | When the system received it |

**Important:** Events are append-only. Do not edit old events except through controlled admin correction flows.

---

### TrackingSnapshot

The fast read model — one record per shipment, updated on each new event.

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUID |
| `tenantId` | string | |
| `shipmentId` | string | Unique — one snapshot per shipment |
| `currentStatus` | `TrackingStatus` | Operational status |
| `operationalStatus` | `TrackingStatus` | Same as currentStatus for most cases |
| `customerStatus` | string | Customer-safe label (e.g. "Out for delivery") |
| `currentTitle` | string | Human-readable title |
| `currentMessage` | string? | Customer-facing message |
| `lastEventId` | string? | FK to last TrackingEvent |
| `lastEventAt` | DateTime? | Time of last update |
| `originName` / `destinationName` | string? | City-level location |
| `estimatedDeliveryAt` / `deliveredAt` | DateTime? | Delivery times |
| `hasException` | boolean | Quick exception flag |
| `exceptionCode` / `exceptionMessage` | string? | Exception detail |
| `assignedDriverId` / `assignedVehicleId` | string? | Current assignment |
| `podAvailable` | boolean | Whether POD has been uploaded |
| `updatedAt` | DateTime | Last snapshot update |

Dashboards and tracking pages **must read from snapshots**. Event timelines read from `TrackingEvent`.

---

### TrackingShare

Controls how customers access public tracking.

| Field | Type | Notes |
|---|---|---|
| `publicToken` | string? | Signed token for direct link access |
| `accessMode` | `TrackingAccessMode` | `TRACKING_NUMBER_ONLY`, `TRACKING_NUMBER_AND_POSTCODE`, or `SIGNED_LINK` |
| `expiresAt` | DateTime? | Optional expiry |

---

### ProofOfDelivery

Structured POD record, replacing the legacy `PodAsset` model.

| Field | Type | Notes |
|---|---|---|
| `method` | `PodMethod` | `SIGNATURE`, `PHOTO`, `OTP`, or `NAME` |
| `recipientName` | string? | |
| `signatureUrl` | string? | |
| `photoUrls` | string[] | Array of photo URLs |
| `otpVerified` | boolean | |
| `capturedByUserId` | string? | |
| `capturedAt` | DateTime | |
| `trackingEventId` | string? | Links to the `POD_UPLOADED` event |

---

## Enums

### TrackingStatus

```typescript
CREATED → BOOKED → LABEL_GENERATED → ASSIGNED
→ PICKUP_SCHEDULED → PICKED_UP
→ AT_ORIGIN_HUB → DEPARTED_ORIGIN_HUB
→ IN_TRANSIT
→ AT_DESTINATION_HUB → OUT_FOR_DELIVERY
→ DELIVERY_ATTEMPTED → DELIVERED
FAILED_DELIVERY → RETURN_STARTED → RETURNED
ANY_ACTIVE → EXCEPTION → (recovery)
ANY_ACTIVE → CANCELLED
CUSTOMS_HOLD → CUSTOMS_RELEASED
```

**Legacy ShipmentStatus mapping:**

| Legacy | New TrackingStatus |
|---|---|
| PENDING | CREATED |
| PROCESSING | BOOKED |
| PICKED_UP | PICKED_UP |
| IN_TRANSIT | IN_TRANSIT |
| OUT_FOR_DELIVERY | OUT_FOR_DELIVERY |
| DELIVERED | DELIVERED |
| FAILED_DELIVERY | FAILED_DELIVERY |
| RETURNED | RETURNED |
| CANCELLED | CANCELLED |
| EXCEPTION | EXCEPTION |

### Customer Status Map

| TrackingStatus | Customer Label |
|---|---|
| CREATED | Order received |
| BOOKED | Shipment booked |
| PICKED_UP | Picked up |
| IN_TRANSIT | In transit |
| OUT_FOR_DELIVERY | Out for delivery |
| DELIVERED | Delivered |
| FAILED_DELIVERY | Delivery issue |
| EXCEPTION | Delayed |
| CUSTOMS_HOLD | Delayed |
| CANCELLED | Cancelled |

### TrackingEventType

`SHIPMENT_CREATED` `SHIPMENT_BOOKED` `LABEL_GENERATED` `DRIVER_ASSIGNED` `PICKUP_SCHEDULED` `PICKED_UP` `ARRIVED_AT_HUB` `DEPARTED_HUB` `IN_TRANSIT` `OUT_FOR_DELIVERY` `DELIVERY_ATTEMPTED` `DELIVERED` `FAILED_DELIVERY` `EXCEPTION_RAISED` `EXCEPTION_RESOLVED` `CUSTOMS_HOLD` `CUSTOMS_RELEASED` `RETURN_STARTED` `RETURNED` `CANCELLED` `POD_UPLOADED` `LOCATION_UPDATED` `ETA_UPDATED` `STATUS_OVERRIDE` `CUSTOMER_NOTIFICATION_SENT` `WEBHOOK_DISPATCHED` `WEBHOOK_FAILED` `OFFLINE_SYNC`

### TrackingSource

| Value | Meaning |
|---|---|
| `TENANT_PORTAL` | Created by tenant staff in the portal |
| `SUPERADMIN` | Created by platform admin |
| `FAUWARD_GO` | Submitted from the field app |
| `CUSTOMER_PORTAL` | Customer-initiated |
| `CARRIER_WEBHOOK` | Inbound from a carrier |
| `API` | External API call |
| `SYSTEM_AUTOMATION` | Queue worker or cron |
| `AI_AGENT` | AI agent action |
| `QUEUE_WORKER` | Background worker |
| `MIGRATION` | Historical backfill |

### TrackingActorType

`TENANT_USER` `PLATFORM_USER` `CUSTOMER` `FIELD_USER` `DRIVER` `SYSTEM` `AI_AGENT` `CARRIER`

### TrackingVisibility

| Level | Who can see it |
|---|---|
| `PLATFORM_ONLY` | Superadmin only |
| `TENANT_INTERNAL` | Tenant staff + superadmin |
| `CUSTOMER_VISIBLE` | Tenant staff + superadmin + customer |
| `FIELD_VISIBLE` | Field workers + tenant staff + superadmin |

---

## Tracking Flow

When a status update happens:

```
1. Source creates a tracking event (via recordTrackingEvent)
2. Tracking Core validates idempotency key
3. Tracking Core validates status transition
4. TrackingEvent is stored (append-only)
5. TrackingSnapshot is updated (upsert)
6. Shipment.status is also updated (legacy compatibility)
7. emitTrackingStatusUpdate → WebSocket (real-time)
8. triggerTrackingNotifications → BullMQ notification queue
9. triggerTrackingWebhooks → BullMQ webhook queue
10. Outbox event created for consistency
```

---

## API Reference

### Public / Customer Tracking

No authentication required. Tenant resolved from subdomain, custom domain, or query param.

```
GET /api/v1/tracking/:trackingNumber
```

Returns only `CUSTOMER_VISIBLE` events. Response format:

```json
{
  "trackingNumber": "AB2605-47-B3K9-83721",
  "tenant": { "name": "ABC Logistics", "logoUrl": "..." },
  "status": "Out for delivery",
  "message": "Your parcel is with the delivery associate today.",
  "estimatedDeliveryAt": "2026-05-02T18:00:00Z",
  "destination": { "city": "Manchester", "country": null },
  "timeline": [
    {
      "title": "Picked up",
      "description": "Your parcel has been collected.",
      "occurredAt": "2026-05-01T09:00:00Z"
    }
  ]
}
```

**Never exposed to customers:**
- Internal notes or driver notes
- Exact driver GPS location
- Full delivery address
- Platform-only or tenant-internal events
- Webhook/queue failures
- Raw exception codes

---

### Tenant Portal Tracking

Requires `authenticate` + tenant context.

```
GET  /api/v1/tenant/tracking                             List all snapshots
GET  /api/v1/tenant/shipments/:shipmentId/tracking       Full tracking detail
POST /api/v1/tenant/shipments/:shipmentId/tracking/events Create manual event
GET  /api/v1/tenant/shipments/:shipmentId/pod            POD info
```

`POST` body for creating an event:

```json
{
  "status": "OUT_FOR_DELIVERY",
  "title": "Out for delivery",
  "description": "Assigned to driver John",
  "locationName": "Depot B",
  "city": "Manchester",
  "visibility": "CUSTOMER_VISIBLE",
  "overrideReason": "Manual correction"
}
```

---

### Superadmin / Platform Tracking

Requires platform session auth.

```
GET /api/v1/platform/tracking                                     Cross-tenant overview
GET /api/v1/platform/tenants/:tenantId/shipments/:shipmentId/tracking  Full detail
GET /api/v1/platform/tracking/exceptions                          All exception shipments
GET /api/v1/platform/tracking/stuck                               Shipments with no update in 24h+
GET /api/v1/platform/tracking/health                              Platform health metrics
```

Query params for `/platform/tracking`:
- `tenantId` — filter by tenant
- `status` — comma-separated status filter
- `hasException=true` — exception filter
- `stuckHours=24` — shipments with no update for N hours

---

### Fauward Go / Field

Requires `authenticate` + tenant context + field role (`TENANT_DRIVER`, `TENANT_STAFF`, etc.).

```
GET  /api/v1/go/jobs/:jobId/tracking          Job + tracking detail
POST /api/v1/go/shipments/:shipmentId/status  Submit status update
POST /api/v1/go/shipments/:shipmentId/location Submit GPS ping
POST /api/v1/go/shipments/:shipmentId/pod     Upload POD
POST /api/v1/go/sync/tracking-events          Offline batch sync (max 100 events)
```

**Offline Sync:**

Field events created offline must include a stable `idempotencyKey`. The sync endpoint deduplicates by `(tenantId, shipmentId, idempotencyKey)`.

Request:
```json
{
  "events": [
    {
      "clientEventId": "local_123",
      "shipmentId": "abc-def",
      "trackingNumber": "QS2605-03-2LOU-07123",
      "status": "DELIVERED",
      "eventType": "DELIVERED",
      "title": "Delivered",
      "idempotencyKey": "driver:abc:1234567890",
      "occurredAt": "2026-05-02T14:30:00Z"
    }
  ]
}
```

Response:
```json
{
  "accepted": [{ "clientEventId": "local_123", "serverEventId": "evt_456" }],
  "rejected": []
}
```

---

## Transition Rules

Allowed transitions (soft validation — overrideable with `overrideReason`):

```
CREATED       → BOOKED, CANCELLED
BOOKED        → LABEL_GENERATED, ASSIGNED, CANCELLED
LABEL_GENERATED → ASSIGNED, PICKUP_SCHEDULED, CANCELLED
ASSIGNED      → PICKUP_SCHEDULED, PICKED_UP, CANCELLED
PICKUP_SCHEDULED → PICKED_UP, CANCELLED
PICKED_UP     → AT_ORIGIN_HUB, IN_TRANSIT, EXCEPTION
IN_TRANSIT    → AT_DESTINATION_HUB, OUT_FOR_DELIVERY, CUSTOMS_HOLD, EXCEPTION
OUT_FOR_DELIVERY → DELIVERED, DELIVERY_ATTEMPTED, FAILED_DELIVERY, EXCEPTION
DELIVERY_ATTEMPTED → OUT_FOR_DELIVERY, FAILED_DELIVERY, EXCEPTION
DELIVERED     → RETURN_STARTED (requires override)
FAILED_DELIVERY → OUT_FOR_DELIVERY, RETURN_STARTED, EXCEPTION
EXCEPTION     → IN_TRANSIT, OUT_FOR_DELIVERY, FAILED_DELIVERY, CANCELLED
CUSTOMS_HOLD  → CUSTOMS_RELEASED, EXCEPTION, CANCELLED
RETURN_STARTED → RETURNED
```

Terminal statuses (`DELIVERED`, `RETURNED`, `CANCELLED`) require `overrideReason` to transition out of.

---

## Shared Package

The `@fauward/tracking-core` package (`packages/tracking-core/`) exports:

- `TrackingStatus` — canonical status enum
- `TrackingEventType` — event type enum
- `TrackingVisibility` — visibility enum
- `TrackingSource` — source enum
- `TrackingActorType` — actor type enum
- `CUSTOMER_STATUS_MAP` — customer-safe status labels
- `CUSTOMER_MESSAGE_MAP` — customer-safe messages
- `ALLOWED_TRACKING_TRANSITIONS` — transition rules
- `legacyToTrackingStatus()` — maps ShipmentStatus → TrackingStatus
- `trackingToLegacyStatus()` — maps TrackingStatus → ShipmentStatus
- `getAllowedVisibilities()` — visibility filter helper
- `canSeeVisibility()` — visibility access check
- TypeScript types: `TrackingEventData`, `TrackingSnapshotData`, `CreateTrackingEventInput`, `FieldSyncEvent`, `FieldSyncResult`, `PublicTrackingResponse`

**All portals must import tracking constants from `@fauward/tracking-core`. Do not define local status enums.**

---

## Notifications and Webhooks

When a `CUSTOMER_VISIBLE` tracking event is created, the system automatically:

1. Sends email notification to customer (if email configured)
2. Sends SMS to customer (PRO/ENTERPRISE plans only)
3. Sends in-app notification to tenant admins
4. Dispatches webhooks to configured tenant webhook endpoints

Webhook event names:
- `tracking.event.created` (default)
- `shipment.delivered`
- `shipment.failed_delivery`
- `shipment.exception`
- `shipment.delivery_attempted`
- `shipment.picked_up`
- `shipment.out_for_delivery`
- `shipment.return_started`

Webhook payload (no internal metadata or sensitive fields):
```json
{
  "tenantId": "...",
  "shipmentId": "...",
  "trackingNumber": "QS2605-03-2LOU-07123",
  "eventType": "shipment.delivered",
  "status": "DELIVERED",
  "customerStatus": "Delivered",
  "occurredAt": "2026-05-02T14:00:00Z",
  "eventId": "..."
}
```

---

## Real-time Updates

Socket.io WebSocket on path `/tracking`. Room name: `{tenantId}:{trackingNumber}`.

When a tracking event is created, `emitTrackingStatusUpdate()` broadcasts to the room.

Polling fallback for portals that don't use WebSocket:
- Tenant portal: poll `/api/v1/tenant/tracking` every 10–15s
- Customer portal: poll `/api/v1/tracking/:trackingNumber` every 20–30s

---

## Migration

To backfill all existing shipments into `TrackingEvent` + `TrackingSnapshot`:

```bash
pnpm tracking:migrate
# or
npm run tracking:migrate --workspace=apps/backend
```

The script:
1. Iterates all shipments in batches of 100
2. For each `ShipmentEvent`, creates a `TrackingEvent` with `source: MIGRATION`
3. Upserts the `TrackingSnapshot` from the shipment's current status
4. Uses `idempotencyKey = migration:{shipmentId}:{index}` — safe to rerun

---

## Security & Privacy

- Customer/public endpoints return only `CUSTOMER_VISIBLE` events
- Full addresses, phone numbers, emails are never returned from public endpoints
- Exact driver GPS location is `FIELD_VISIBLE` — not returned to customers
- Tenant users cannot access another tenant's data (tenant isolation via middleware)
- Platform endpoints require separate platform session auth (`authenticatePlatformSession`)
- All tracking events have a `visibility` level enforced at the API layer

---

## Backward Compatibility

- `Shipment.status` (legacy `ShipmentStatus`) is preserved and updated alongside `TrackingSnapshot`
- `ShipmentEvent` table is preserved; new events are written to both `ShipmentEvent` (legacy) and `TrackingEvent` (canonical)
- The legacy `PodAsset` table is preserved; new POD goes into `ProofOfDelivery`
- Legacy public tracking at `GET /api/v1/tracking/:trackingNumber` falls back to `ShipmentEvent` if no `TrackingSnapshot` exists

---

## File Index

```
packages/tracking-core/src/
  statuses.ts           TrackingStatus enum, customer map, transitions
  events.ts             TrackingEventType enum
  visibility.ts         TrackingVisibility enum + filter helpers
  sources.ts            TrackingSource + TrackingActorType enums
  status-mapper.ts      Legacy ↔ canonical status conversion
  tracking-types.ts     TypeScript interfaces
  index.ts              Re-exports

apps/backend/src/modules/tracking/
  tracking.public.routes.ts     GET /api/v1/tracking/:trackingNumber
  tracking.tenant.routes.ts     Tenant portal tracking APIs
  tracking.platform.routes.ts   Superadmin tracking APIs
  tracking.go.routes.ts         Fauward Go field APIs
  tracking.service.ts           Coordinator service
  tracking-event.service.ts     Event creation + idempotency
  tracking-snapshot.service.ts  Snapshot upsert logic
  tracking-visibility.service.ts Visibility filtering
  tracking-status-mapper.ts     Legacy status mapper (backend)
  tracking-policy.service.ts    Transition validation
  tracking-notification.service.ts Notification triggers
  tracking-webhook.service.ts   Webhook dispatch
  tracking.websocket.ts         Socket.io real-time (existing)

apps/backend/src/scripts/
  migrate-tracking.ts           Backfill migration script

supabase/migrations/
  20260502100000_tracking_core.sql  SQL DDL for new tables
```
