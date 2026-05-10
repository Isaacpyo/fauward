ALTER TABLE "route_stops" ADD COLUMN IF NOT EXISTS "sequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "route_stops" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS "route_stops_shipmentId_idx" ON "route_stops"("shipmentId");

ALTER TABLE "route_stops"
  ADD CONSTRAINT "route_stops_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
