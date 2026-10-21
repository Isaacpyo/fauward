-- gtm.attribution (WP-4.16): first-touch rows written at signup (utm_*, referrer, landing page), one per tenant and touch type.
-- Rows from before this migration had no producer and no touch type; they are kept as LEGACY:<id> so the unique index holds.
-- AlterTable
ALTER TABLE "marketing_attributions" ADD COLUMN     "content" TEXT,
ADD COLUMN     "medium" TEXT,
ADD COLUMN     "referrer" TEXT,
ADD COLUMN     "term" TEXT,
ADD COLUMN     "touchType" TEXT NOT NULL DEFAULT 'FIRST_TOUCH';

-- Data
UPDATE "marketing_attributions" SET "touchType" = 'LEGACY:' || "id";

-- CreateIndex
CREATE UNIQUE INDEX "marketing_attributions_tenantId_touchType_key" ON "marketing_attributions"("tenantId", "touchType");

