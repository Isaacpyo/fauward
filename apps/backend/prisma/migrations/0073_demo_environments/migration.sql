-- gtm.demos (WP-4.15): demo environments record the prospect, the seeded admin, what was seeded, rotation and the end
-- (expiry or teardown). shareTokenHash becomes unique; legacy placeholder values (demo_<tenantId>, never a hash) are cleared. Additive.
-- AlterTable
ALTER TABLE "demo_environments" ADD COLUMN     "adminEmail" TEXT,
ADD COLUMN     "adminUserId" TEXT,
ADD COLUMN     "endReason" TEXT,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "endedBy" TEXT,
ADD COLUMN     "prospectName" TEXT,
ADD COLUMN     "seedSummary" JSONB,
ADD COLUMN     "shareRotatedAt" TIMESTAMP(3);

-- Data: the pre-WP-4.15 route stored the literal demo_<tenantId>, which no share token hashes to.
UPDATE "demo_environments" SET "shareTokenHash" = NULL WHERE "shareTokenHash" LIKE 'demo\_%';

-- CreateIndex
CREATE UNIQUE INDEX "demo_environments_shareTokenHash_key" ON "demo_environments"("shareTokenHash");

