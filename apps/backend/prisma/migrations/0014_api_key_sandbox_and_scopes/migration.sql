ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "scopes" TEXT[];
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "isSandbox" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "monthlyRequestCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "api_keys" SET "scopes" = ARRAY['shipments:read']::TEXT[] WHERE "scopes" IS NULL;
ALTER TABLE "api_keys" ALTER COLUMN "scopes" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "api_usage_records" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "apiKeyId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_usage_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "api_usage_records_tenantId_timestamp_idx" ON "api_usage_records"("tenantId", "timestamp");
CREATE INDEX IF NOT EXISTS "api_usage_records_tenantId_apiKeyId_timestamp_idx" ON "api_usage_records"("tenantId", "apiKeyId", "timestamp");

DO $$ BEGIN
  ALTER TABLE "api_usage_records" ADD CONSTRAINT "api_usage_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "api_usage_records" ADD CONSTRAINT "api_usage_records_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
