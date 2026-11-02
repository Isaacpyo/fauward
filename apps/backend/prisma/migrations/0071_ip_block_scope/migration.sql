-- trust.security (WP-4.11): IP block scope and hit counters (enforced in WP-5.4); anomaly acknowledge/resolve fields. Additive.
-- AlterTable
ALTER TABLE "security_anomalies" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedBy" TEXT,
ADD COLUMN     "resolutionNote" TEXT;

-- AlterTable
ALTER TABLE "ip_blocks" ADD COLUMN     "hitCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastHitAt" TIMESTAMP(3),
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'ALL';

