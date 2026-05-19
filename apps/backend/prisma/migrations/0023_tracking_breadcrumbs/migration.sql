-- Create the append-only realtime tracking breadcrumb table
-- This stores lightweight location/status/flag events for sub-second dashboard reads
-- and full breadcrumb history. Rich canonical events remain in tracking_events.

CREATE TABLE "tracking_breadcrumbs" (
  "id" BIGSERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "shipment_id" TEXT NOT NULL,
  "seq" BIGINT NOT NULL,
  "event_type" TEXT NOT NULL,
  "lat" DECIMAL(10,7),
  "lng" DECIMAL(10,7),
  "accuracy_m" INTEGER,
  "status" TEXT,
  "source" TEXT NOT NULL,
  "source_ref" TEXT,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "ingested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("tenant_id", "shipment_id", "seq")
);

CREATE INDEX "tracking_breadcrumbs_lookup"
  ON "tracking_breadcrumbs" ("tenant_id", "shipment_id", "occurred_at" DESC);

CREATE INDEX "tracking_breadcrumbs_tenant_recent"
  ON "tracking_breadcrumbs" ("tenant_id", "occurred_at" DESC);
