-- customer.qbr (WP-4.9): generated sections, job and sharing state; one deck per tenant and quarter. Additive.
-- AlterTable
ALTER TABLE "qbr_decks" ADD COLUMN     "error" TEXT,
ADD COLUMN     "generatedAt" TIMESTAMP(3),
ADD COLUMN     "generatedBy" TEXT,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "periodKey" TEXT,
ADD COLUMN     "sections" JSONB,
ADD COLUMN     "sharedAt" TIMESTAMP(3),
ADD COLUMN     "sharedBy" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "qbr_decks_tenantId_periodKey_key" ON "qbr_decks"("tenantId", "periodKey");

