-- CreateTable
CREATE TABLE "gateway_payouts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPayoutId" TEXT NOT NULL,
    "arrivalDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_payout_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "providerTxnId" TEXT NOT NULL,
    "providerSourceId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "matchedPaymentId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_payout_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gateway_payouts_tenantId_providerPayoutId_key" ON "gateway_payouts"("tenantId", "providerPayoutId");

-- CreateIndex
CREATE INDEX "gateway_payouts_tenantId_arrivalDate_idx" ON "gateway_payouts"("tenantId", "arrivalDate");

-- CreateIndex
CREATE INDEX "gateway_payout_lines_payoutId_idx" ON "gateway_payout_lines"("payoutId");

-- CreateIndex
CREATE INDEX "gateway_payout_lines_tenantId_providerSourceId_idx" ON "gateway_payout_lines"("tenantId", "providerSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_payout_lines_tenantId_providerTxnId_key" ON "gateway_payout_lines"("tenantId", "providerTxnId");

-- CreateIndex
CREATE INDEX "payments_tenantId_gatewayRef_idx" ON "payments"("tenantId", "gatewayRef");

-- AddForeignKey
ALTER TABLE "gateway_payouts" ADD CONSTRAINT "gateway_payouts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_payout_lines" ADD CONSTRAINT "gateway_payout_lines_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "gateway_payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_payout_lines" ADD CONSTRAINT "gateway_payout_lines_matchedPaymentId_fkey" FOREIGN KEY ("matchedPaymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
