ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "isSandbox" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "customsDeclarationId" TEXT;
ALTER TABLE "rate_quotes" ADD COLUMN IF NOT EXISTS "isSandbox" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "shipments_tenantId_isSandbox_idx" ON "shipments"("tenantId", "isSandbox");
CREATE INDEX IF NOT EXISTS "shipments_customsDeclarationId_idx" ON "shipments"("customsDeclarationId");
CREATE INDEX IF NOT EXISTS "rate_quotes_tenantId_isSandbox_idx" ON "rate_quotes"("tenantId", "isSandbox");
