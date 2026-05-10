CREATE TABLE IF NOT EXISTS "tenant_ai_usage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "tokenCount" INTEGER NOT NULL DEFAULT 0,
  "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TenantAiLimit" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "monthlyBudgetUsd" DOUBLE PRECISION,
  "flashRequestLimit" INTEGER,
  "proRequestLimit" INTEGER,
  "featuresEnabled" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "TenantAiLimit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_agent_runs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "agentType" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "output" JSONB,
  "status" TEXT NOT NULL,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_agent_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_ai_usage_tenantId_month_model_feature_key" ON "tenant_ai_usage"("tenantId", "month", "model", "feature");
CREATE INDEX IF NOT EXISTS "tenant_ai_usage_tenantId_idx" ON "tenant_ai_usage"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "TenantAiLimit_tenantId_key" ON "TenantAiLimit"("tenantId");
CREATE INDEX IF NOT EXISTS "ai_agent_runs_tenantId_createdAt_idx" ON "ai_agent_runs"("tenantId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "tenant_ai_usage" ADD CONSTRAINT "tenant_ai_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TenantAiLimit" ADD CONSTRAINT "TenantAiLimit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
