-- ─────────────────────────────────────────────────────────────────────────────
-- 20260502100000_tracking_core.sql
-- Unified Tracking Core: TrackingEvent, TrackingSnapshot, TrackingShare,
-- ProofOfDelivery. All enums use text check constraints for portability.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── ENUMS (as Postgres enum types, mirroring Prisma) ────────────────────────

do $$ begin
  create type "TrackingStatus" as enum (
    'CREATED','BOOKED','LABEL_GENERATED','ASSIGNED',
    'PICKUP_SCHEDULED','PICKED_UP',
    'AT_ORIGIN_HUB','DEPARTED_ORIGIN_HUB',
    'IN_TRANSIT',
    'AT_DESTINATION_HUB','OUT_FOR_DELIVERY',
    'DELIVERY_ATTEMPTED','DELIVERED',
    'FAILED_DELIVERY','EXCEPTION',
    'CUSTOMS_HOLD','CUSTOMS_RELEASED',
    'RETURN_STARTED','RETURNED','CANCELLED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type "TrackingEventType" as enum (
    'SHIPMENT_CREATED','SHIPMENT_BOOKED','LABEL_GENERATED','DRIVER_ASSIGNED',
    'PICKUP_SCHEDULED','PICKED_UP','ARRIVED_AT_HUB','DEPARTED_HUB',
    'IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERY_ATTEMPTED','DELIVERED',
    'FAILED_DELIVERY','EXCEPTION_RAISED','EXCEPTION_RESOLVED',
    'CUSTOMS_HOLD','CUSTOMS_RELEASED','RETURN_STARTED','RETURNED','CANCELLED',
    'POD_UPLOADED','LOCATION_UPDATED','ETA_UPDATED','STATUS_OVERRIDE',
    'CUSTOMER_NOTIFICATION_SENT','WEBHOOK_DISPATCHED','WEBHOOK_FAILED','OFFLINE_SYNC'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type "TrackingSource" as enum (
    'TENANT_PORTAL','SUPERADMIN','FAUWARD_GO','CUSTOMER_PORTAL',
    'CARRIER_WEBHOOK','API','SYSTEM_AUTOMATION','AI_AGENT','QUEUE_WORKER','MIGRATION'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type "TrackingVisibility" as enum (
    'PLATFORM_ONLY','TENANT_INTERNAL','CUSTOMER_VISIBLE','FIELD_VISIBLE'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type "TrackingActorType" as enum (
    'TENANT_USER','PLATFORM_USER','CUSTOMER','FIELD_USER',
    'DRIVER','SYSTEM','AI_AGENT','CARRIER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type "PodMethod" as enum ('SIGNATURE','PHOTO','OTP','NAME');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "TrackingAccessMode" as enum (
    'TRACKING_NUMBER_ONLY','TRACKING_NUMBER_AND_POSTCODE','SIGNED_LINK'
  );
exception when duplicate_object then null; end $$;

-- ─── TRACKING EVENTS ─────────────────────────────────────────────────────────

create table if not exists "tracking_events" (
  "id"              text        primary key default gen_random_uuid()::text,
  "tenantId"        text        not null references "tenants"("id") on delete cascade,
  "shipmentId"      text        not null references "shipments"("id") on delete cascade,
  "trackingNumber"  text        not null,

  "eventType"       "TrackingEventType" not null,
  "status"          "TrackingStatus"    not null,

  "title"           text        not null,
  "description"     text,

  "source"          "TrackingSource"     not null,
  "actorType"       "TrackingActorType"  not null,
  "actorId"         text,

  "visibility"      "TrackingVisibility" not null,

  "locationName"    text,
  "city"            text,
  "region"          text,
  "country"         text,
  "lat"             decimal(10,8),
  "lng"             decimal(11,8),

  "metadata"        jsonb,
  "idempotencyKey"  text,

  "occurredAt"      timestamptz not null,
  "createdAt"       timestamptz not null default now()
);

create unique index if not exists tracking_events_idempotency_idx
  on "tracking_events" ("tenantId", "shipmentId", "idempotencyKey")
  where "idempotencyKey" is not null;

create index if not exists tracking_events_shipment_idx
  on "tracking_events" ("tenantId", "shipmentId");

create index if not exists tracking_events_tracking_number_idx
  on "tracking_events" ("tenantId", "trackingNumber");

create index if not exists tracking_events_status_idx
  on "tracking_events" ("tenantId", "status");

create index if not exists tracking_events_occurred_at_idx
  on "tracking_events" ("tenantId", "occurredAt" desc);

-- ─── TRACKING SNAPSHOTS ──────────────────────────────────────────────────────

create table if not exists "tracking_snapshots" (
  "id"                  text        primary key default gen_random_uuid()::text,
  "tenantId"            text        not null references "tenants"("id") on delete cascade,
  "shipmentId"          text        not null unique references "shipments"("id") on delete cascade,
  "trackingNumber"      text        not null,

  "currentStatus"       "TrackingStatus" not null,
  "operationalStatus"   "TrackingStatus" not null,
  "customerStatus"      text        not null,

  "currentTitle"        text        not null,
  "currentMessage"      text,

  "lastEventId"         text,
  "lastEventAt"         timestamptz,

  "originName"          text,
  "destinationName"     text,

  "estimatedDeliveryAt" timestamptz,
  "deliveredAt"         timestamptz,

  "hasException"        boolean     not null default false,
  "exceptionCode"       text,
  "exceptionMessage"    text,

  "assignedDriverId"    text,
  "assignedVehicleId"   text,

  "podAvailable"        boolean     not null default false,

  "updatedAt"           timestamptz not null default now()
);

create index if not exists tracking_snapshots_tenant_idx
  on "tracking_snapshots" ("tenantId");

create index if not exists tracking_snapshots_status_idx
  on "tracking_snapshots" ("tenantId", "currentStatus");

create index if not exists tracking_snapshots_tracking_number_idx
  on "tracking_snapshots" ("tenantId", "trackingNumber");

-- ─── TRACKING SHARES ─────────────────────────────────────────────────────────

create table if not exists "tracking_shares" (
  "id"            text        primary key default gen_random_uuid()::text,
  "tenantId"      text        not null references "tenants"("id") on delete cascade,
  "shipmentId"    text        not null references "shipments"("id") on delete cascade,
  "trackingNumber" text       not null,
  "publicToken"   text        unique,
  "accessMode"    "TrackingAccessMode" not null default 'TRACKING_NUMBER_ONLY',
  "expiresAt"     timestamptz,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

create index if not exists tracking_shares_shipment_idx
  on "tracking_shares" ("tenantId", "shipmentId");

-- ─── PROOF OF DELIVERY ───────────────────────────────────────────────────────

create table if not exists "proof_of_delivery" (
  "id"                  text        primary key default gen_random_uuid()::text,
  "tenantId"            text        not null references "tenants"("id") on delete cascade,
  "shipmentId"          text        not null references "shipments"("id") on delete cascade,
  "trackingEventId"     text        unique references "tracking_events"("id"),

  "method"              "PodMethod" not null,

  "recipientName"       text,
  "signatureUrl"        text,
  "photoUrls"           text[]      not null default '{}',
  "otpVerified"         boolean     not null default false,

  "capturedByUserId"    text,
  "capturedByActorType" text,

  "capturedAt"          timestamptz not null,
  "createdAt"           timestamptz not null default now()
);

create index if not exists pod_shipment_idx
  on "proof_of_delivery" ("tenantId", "shipmentId");
