-- WP-2.10 (L16): console-set AI limits record who set them and why; the monthly budget is money, so Decimal(12,2).
-- Additive apart from the budget type change (double precision → numeric(12,2), values rounded to cents).

-- AlterTable
ALTER TABLE "TenantAiLimit" ALTER COLUMN "monthlyBudgetUsd" SET DATA TYPE DECIMAL(12,2),
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedByPlatformUserId" TEXT;
