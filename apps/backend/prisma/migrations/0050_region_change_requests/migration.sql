-- WP-2.6 (L5): persistent tenant region change requests (were in memory). Additive.

-- CreateTable
CREATE TABLE "region_change_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currentRegion" TEXT NOT NULL,
    "requestedRegion" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decisionReason" TEXT,
    "decidedByPlatformUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "region_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "region_change_requests_status_createdAt_idx" ON "region_change_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "region_change_requests_tenantId_createdAt_idx" ON "region_change_requests"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "region_change_requests" ADD CONSTRAINT "region_change_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

