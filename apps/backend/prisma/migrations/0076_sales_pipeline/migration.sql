-- gtm.pipeline (WP-4.18): deals created in the console or imported from HubSpot; probability is a percent (0–100).
-- Additive. Existing rows keep their stage text; rows with a HubSpot id are marked as imported.
-- AlterTable
ALTER TABLE "sales_deals" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "hubspotSyncedAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'CONSOLE',
ADD COLUMN     "wonAt" TIMESTAMP(3);

UPDATE "sales_deals" SET "source" = 'HUBSPOT' WHERE "hubspotDealId" IS NOT NULL;
UPDATE "sales_deals" SET "wonAt" = "updatedAt" WHERE "stage" = 'WON' AND "wonAt" IS NULL;

-- CreateIndex
CREATE INDEX "sales_deals_ownerEmail_idx" ON "sales_deals"("ownerEmail");
