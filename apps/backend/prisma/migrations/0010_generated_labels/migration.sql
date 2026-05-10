DO $$ BEGIN
  CREATE TYPE "LabelFormat" AS ENUM ('PDF', 'ZPL', 'PNG');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "generated_labels" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "format" "LabelFormat" NOT NULL,
  "url" TEXT NOT NULL,
  "carrier" TEXT,
  "barcodeData" TEXT,
  "trackingNumber" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generated_labels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "generated_labels_tenantId_idx" ON "generated_labels"("tenantId");
CREATE INDEX IF NOT EXISTS "generated_labels_tenantId_shipmentId_idx" ON "generated_labels"("tenantId", "shipmentId");

DO $$ BEGIN
  ALTER TABLE "generated_labels" ADD CONSTRAINT "generated_labels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "generated_labels" ADD CONSTRAINT "generated_labels_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
