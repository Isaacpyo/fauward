-- Tenant close + staff-set limits (spec label 0042_tenant_close; renumbered at creation, C11). Additive.
-- closedAt/closedReason/purgeAfter: POST /api/internal/tenants/:id/close (purgeAfter = closedAt + TENANT_CLOSE_RETENTION_DAYS).
-- limitsOverriddenAt: set by PATCH /api/internal/tenants/:id/limits; null = the effective plan's limits apply (C42).
-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedReason" TEXT,
ADD COLUMN     "limitsOverriddenAt" TIMESTAMP(3),
ADD COLUMN     "purgeAfter" TIMESTAMP(3);

