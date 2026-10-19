-- WP-2.12 (L11): tenant payment gateways with field-encrypted secrets (replaces the plaintext JSON in
-- TenantSettings.paymentGatewayKey, which the backfill 0055-tenant-payment-gateways.ts moves). Additive.

-- CreateTable
CREATE TABLE "tenant_payment_gateways" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'LIVE',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publicKey" TEXT,
    "secretKeyEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "encryptionKeyEncrypted" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_payment_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_payment_gateways_status_idx" ON "tenant_payment_gateways"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payment_gateways_tenantId_provider_key" ON "tenant_payment_gateways"("tenantId", "provider");

-- AddForeignKey
ALTER TABLE "tenant_payment_gateways" ADD CONSTRAINT "tenant_payment_gateways_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

