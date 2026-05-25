-- CreateTable
CREATE TABLE "shipment_permission_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedAction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "respondedByUserId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_permission_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipment_permission_requests_tenantId_status_idx" ON "shipment_permission_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "shipment_permission_requests_tenantId_shipmentId_status_idx" ON "shipment_permission_requests"("tenantId", "shipmentId", "status");

-- CreateIndex
CREATE INDEX "shipment_permission_requests_requestedByUserId_idx" ON "shipment_permission_requests"("requestedByUserId");

-- AddForeignKey
ALTER TABLE "shipment_permission_requests" ADD CONSTRAINT "shipment_permission_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_permission_requests" ADD CONSTRAINT "shipment_permission_requests_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
