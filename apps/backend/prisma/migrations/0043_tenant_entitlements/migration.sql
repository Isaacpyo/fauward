-- Per-tenant feature overrides (spec label 0041_tenant_entitlements; renumbered at creation, C11). Additive.
-- Source of truth for per-tenant feature switches, read by resolveTenantEntitlements (WP-1.4, D9).
-- CreateTable
CREATE TABLE "tenant_feature_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdByPlatformUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByPlatformUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_feature_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_feature_overrides_tenantId_featureKey_revokedAt_idx" ON "tenant_feature_overrides"("tenantId", "featureKey", "revokedAt");

-- AddForeignKey
ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

