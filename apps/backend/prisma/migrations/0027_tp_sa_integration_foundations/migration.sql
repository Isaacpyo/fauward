-- Tenant Portal / Super Admin integration foundations.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "suspensionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingSteps" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

ALTER TABLE "ticket_messages"
  ADD COLUMN IF NOT EXISTS "fromSA" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "platformAuthorId" TEXT;

ALTER TABLE "tenant_appeals"
  ADD COLUMN IF NOT EXISTS "contactEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

CREATE TABLE IF NOT EXISTS "platform_announcements" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "targetAll" BOOLEAN NOT NULL DEFAULT true,
  "tenantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "planTiers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cta" JSONB,
  "dismissible" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "platform_announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "platform_announcements_targetAll_publishedAt_idx"
  ON "platform_announcements"("targetAll", "publishedAt");

CREATE INDEX IF NOT EXISTS "platform_announcements_expiresAt_idx"
  ON "platform_announcements"("expiresAt");
