CREATE TABLE IF NOT EXISTS "shipping_rules" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "conditions" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipping_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shipping_rules_tenantId_isActive_priority_idx" ON "shipping_rules"("tenantId", "isActive", "priority");

DO $$ BEGIN
  ALTER TABLE "shipping_rules" ADD CONSTRAINT "shipping_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
