ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "customDomainStatus" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "customDomainVerificationToken" TEXT,
  ADD COLUMN IF NOT EXISTS "customDomainAddedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "customDomainVerifiedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "customDomainLastCheckAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "customDomainError" TEXT,
  ADD COLUMN IF NOT EXISTS "customDomainVercelId" TEXT;

UPDATE "tenants"
SET
  "customDomainStatus" = CASE
    WHEN "customDomain" IS NULL THEN 'NONE'
    WHEN "domainVerified" = true THEN 'ACTIVE'
    ELSE 'PENDING_DNS'
  END,
  "customDomainAddedAt" = CASE
    WHEN "customDomain" IS NOT NULL AND "customDomainAddedAt" IS NULL THEN "createdAt"
    ELSE "customDomainAddedAt"
  END,
  "customDomainVerifiedAt" = CASE
    WHEN "customDomain" IS NOT NULL AND "domainVerified" = true AND "customDomainVerifiedAt" IS NULL THEN "updatedAt"
    ELSE "customDomainVerifiedAt"
  END
WHERE "customDomainStatus" = 'NONE';

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_customDomain_key" ON "tenants"("customDomain");
CREATE INDEX IF NOT EXISTS "tenants_customDomainStatus_idx" ON "tenants"("customDomainStatus");
