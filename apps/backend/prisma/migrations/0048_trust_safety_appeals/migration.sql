-- WP-2.4 (trust.safety, L3): fraud/AUP signal category and decision fields; appeal REQUEST_INFO question/answer and
-- decision time. Additive (existing signals become category FRAUD).

-- AlterTable
ALTER TABLE "fraud_signals" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'FRAUD',
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decisionNote" TEXT;

-- AlterTable
ALTER TABLE "tenant_appeals" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "infoRequest" TEXT,
ADD COLUMN     "infoRequestedAt" TIMESTAMP(3),
ADD COLUMN     "tenantRepliedAt" TIMESTAMP(3),
ADD COLUMN     "tenantReply" TEXT;

