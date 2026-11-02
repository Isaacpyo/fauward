-- trust.kyc (WP-4.10): manual review queue (evidence, decision), screening decisions. Rows created without a vendor default to provider manual.
-- AlterTable
ALTER TABLE "kyc_reviews" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "openedBy" TEXT,
ADD COLUMN     "requestNote" TEXT,
ALTER COLUMN "provider" SET DEFAULT 'manual';

-- AlterTable
ALTER TABLE "sanctions_screenings" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "source" TEXT,
ALTER COLUMN "provider" SET DEFAULT 'manual';


-- Tenant.kycStatus vocabulary: PENDING | IN_REVIEW | APPROVED | REJECTED (the old code wrote VERIFIED / PENDING_REVIEW).
UPDATE "tenants" SET "kycStatus" = 'APPROVED' WHERE "kycStatus" = 'VERIFIED';
UPDATE "tenants" SET "kycStatus" = 'IN_REVIEW' WHERE "kycStatus" = 'PENDING_REVIEW';
-- Reviews and screenings: open reviews are OPEN; screenings PENDING_REVIEW are PENDING.
UPDATE "kyc_reviews" SET "status" = 'OPEN' WHERE "status" IN ('PENDING', 'NEEDS_REVIEW', 'needs_review', 'pending', 'created');
UPDATE "sanctions_screenings" SET "status" = 'PENDING' WHERE "status" = 'PENDING_REVIEW';
