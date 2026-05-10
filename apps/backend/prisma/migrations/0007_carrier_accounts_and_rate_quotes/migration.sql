CREATE TABLE IF NOT EXISTS "carrier_accounts" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "carrier" TEXT NOT NULL,
  "credentials" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "carrier_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "carrier_service_levels" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "carrierAccountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "transitDays" INTEGER NOT NULL,
  "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "carrier_service_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rate_quotes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentId" TEXT,
  "origin" JSONB NOT NULL,
  "destination" JSONB NOT NULL,
  "weightKg" DOUBLE PRECISION NOT NULL,
  "volumetricWeightKg" DOUBLE PRECISION,
  "quotes" JSONB NOT NULL,
  "selectedCarrier" TEXT,
  "selectedServiceLevel" TEXT,
  "isSandbox" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rate_quotes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "rateQuoteId" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "carrierAccountId" TEXT;

CREATE INDEX IF NOT EXISTS "carrier_accounts_tenantId_idx" ON "carrier_accounts"("tenantId");
CREATE INDEX IF NOT EXISTS "carrier_accounts_tenantId_carrier_idx" ON "carrier_accounts"("tenantId", "carrier");
CREATE INDEX IF NOT EXISTS "carrier_service_levels_tenantId_idx" ON "carrier_service_levels"("tenantId");
CREATE INDEX IF NOT EXISTS "carrier_service_levels_carrierAccountId_idx" ON "carrier_service_levels"("carrierAccountId");
CREATE INDEX IF NOT EXISTS "rate_quotes_tenantId_idx" ON "rate_quotes"("tenantId");
CREATE INDEX IF NOT EXISTS "rate_quotes_tenantId_isSandbox_idx" ON "rate_quotes"("tenantId", "isSandbox");
CREATE INDEX IF NOT EXISTS "rate_quotes_shipmentId_idx" ON "rate_quotes"("shipmentId");
CREATE INDEX IF NOT EXISTS "rate_quotes_tenantId_expiresAt_idx" ON "rate_quotes"("tenantId", "expiresAt");
CREATE INDEX IF NOT EXISTS "shipments_rateQuoteId_idx" ON "shipments"("rateQuoteId");
CREATE INDEX IF NOT EXISTS "shipments_carrierAccountId_idx" ON "shipments"("carrierAccountId");

DO $$ BEGIN
  ALTER TABLE "carrier_accounts" ADD CONSTRAINT "carrier_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "carrier_service_levels" ADD CONSTRAINT "carrier_service_levels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "carrier_service_levels" ADD CONSTRAINT "carrier_service_levels_carrierAccountId_fkey" FOREIGN KEY ("carrierAccountId") REFERENCES "carrier_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "rate_quotes" ADD CONSTRAINT "rate_quotes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shipments" ADD CONSTRAINT "shipments_rateQuoteId_fkey" FOREIGN KEY ("rateQuoteId") REFERENCES "rate_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrierAccountId_fkey" FOREIGN KEY ("carrierAccountId") REFERENCES "carrier_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
