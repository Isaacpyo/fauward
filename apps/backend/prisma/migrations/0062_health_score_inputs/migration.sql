-- WP-3.3 (customer.success): health score inputs and model version. Additive; existing rows read version 1.

-- AlterTable
ALTER TABLE "tenant_health_scores" ADD COLUMN     "inputs" JSONB,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

