CREATE TABLE IF NOT EXISTS "customs_declarations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "totalValue" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "documents" JSONB,
  "status" TEXT NOT NULL,
  "holdReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customs_declarations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "customsDeclarationId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "customs_declarations_shipmentId_key" ON "customs_declarations"("shipmentId");
CREATE INDEX IF NOT EXISTS "customs_declarations_tenantId_idx" ON "customs_declarations"("tenantId");
CREATE INDEX IF NOT EXISTS "customs_declarations_tenantId_status_idx" ON "customs_declarations"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "shipments_customsDeclarationId_idx" ON "shipments"("customsDeclarationId");

DO $$ BEGIN
  ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
