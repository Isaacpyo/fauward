-- gtm.handoff (WP-4.17): handoffs are created from the trial → paid conversion (one per conversion event), assigned to a CSM,
-- accepted and completed. Additive.
-- AlterTable
ALTER TABLE "sales_handoffs" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedBy" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedBy" TEXT,
ADD COLUMN     "subscriptionEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sales_handoffs_subscriptionEventId_key" ON "sales_handoffs"("subscriptionEventId");

-- CreateIndex
CREATE INDEX "sales_handoffs_status_createdAt_idx" ON "sales_handoffs"("status", "createdAt");

