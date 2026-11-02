-- gtm.trials (WP-4.14): extension decisions record who, when, why and the trial end before/after; pendingTenantId (unique)
-- allows one PENDING request per tenant; stripeSync records the Stripe trial_end mirror. Additive.
-- AlterTable
ALTER TABLE "trial_extension_requests" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedBy" TEXT,
ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "newTrialEnd" TIMESTAMP(3),
ADD COLUMN     "pendingTenantId" TEXT,
ADD COLUMN     "previousTrialEnd" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'TENANT',
ADD COLUMN     "stripeSync" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "trial_extension_requests_pendingTenantId_key" ON "trial_extension_requests"("pendingTenantId");

-- CreateIndex
CREATE INDEX "trial_extension_requests_status_createdAt_idx" ON "trial_extension_requests"("status", "createdAt");


-- Data: older duplicate PENDING requests for the same tenant are closed so the newest one can hold the pending key.
UPDATE "trial_extension_requests" r
SET "status" = 'DENIED', "decidedAt" = NOW(), "decisionReason" = 'Superseded by a newer request from the same tenant (migration 0072).'
WHERE r."status" = 'PENDING'
  AND EXISTS (
    SELECT 1 FROM "trial_extension_requests" n
    WHERE n."tenantId" = r."tenantId" AND n."status" = 'PENDING'
      AND (n."createdAt" > r."createdAt" OR (n."createdAt" = r."createdAt" AND n."id" > r."id"))
  );

UPDATE "trial_extension_requests" SET "pendingTenantId" = "tenantId" WHERE "status" = 'PENDING';
