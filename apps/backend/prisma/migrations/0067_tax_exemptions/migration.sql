-- revenue.tax (WP-4.7): tax exemption certificates uploaded by tenants and decided by staff. Additive.
-- AlterTable
ALTER TABLE "tax_exemptions" ADD COLUMN     "byteSize" INTEGER,
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedBy" TEXT,
ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedBy" TEXT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "storageProvider" TEXT,
ADD COLUMN     "submittedByUserId" TEXT;


-- Rows approved before this migration keep their approver as the decider.
UPDATE "tax_exemptions" SET "decidedBy" = "approvedBy", "decidedAt" = "approvedAt" WHERE "status" = 'APPROVED' AND "decidedAt" IS NULL;
