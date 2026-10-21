-- revenue.disputes (WP-4.6): Stripe disputes (charge.dispute.created/updated/closed). Additive, new table.
-- CreateTable
CREATE TABLE "payment_disputes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "paymentId" TEXT,
    "paymentKind" TEXT,
    "stripeDisputeId" TEXT NOT NULL,
    "stripeChargeId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidenceDueBy" TIMESTAMP(3),
    "evidence" JSONB,
    "submittedAt" TIMESTAMP(3),
    "deadlineNotifiedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_disputes_stripeDisputeId_key" ON "payment_disputes"("stripeDisputeId");

-- CreateIndex
CREATE INDEX "payment_disputes_status_evidenceDueBy_idx" ON "payment_disputes"("status", "evidenceDueBy");

-- CreateIndex
CREATE INDEX "payment_disputes_tenantId_createdAt_idx" ON "payment_disputes"("tenantId", "createdAt");

