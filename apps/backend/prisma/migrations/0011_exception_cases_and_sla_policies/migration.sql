CREATE TABLE IF NOT EXISTS "exception_cases" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentId" TEXT,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "assignedTo" TEXT,
  "aiDiagnosis" JSONB,
  "notes" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exception_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sla_policies" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "serviceType" TEXT,
  "pickupWindowHours" INTEGER NOT NULL,
  "deliveryWindowHours" INTEGER NOT NULL,
  "escalationHours" INTEGER NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "exception_cases_tenantId_status_idx" ON "exception_cases"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "exception_cases_tenantId_shipmentId_status_idx" ON "exception_cases"("tenantId", "shipmentId", "status");
CREATE INDEX IF NOT EXISTS "sla_policies_tenantId_isDefault_idx" ON "sla_policies"("tenantId", "isDefault");

DO $$ BEGIN
  ALTER TABLE "exception_cases" ADD CONSTRAINT "exception_cases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "exception_cases" ADD CONSTRAINT "exception_cases_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
