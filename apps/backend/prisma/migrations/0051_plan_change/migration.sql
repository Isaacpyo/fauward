-- WP-2.7 (revenue.subscriptions, L6): plan change requests, subscription events (MRR before/after, Stripe event
-- dedupe), save offer code/redemption. Additive; backfill 0051-subscription-events.ts writes the CREATED history.

-- AlterTable
ALTER TABLE "save_offers" ADD COLUMN     "code" TEXT,
ADD COLUMN     "redeemedAt" TIMESTAMP(3),
ADD COLUMN     "redeemedCreditNoteId" TEXT,
ADD COLUMN     "stripeCouponId" TEXT;

-- CreateTable
CREATE TABLE "plan_change_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromPlan" TEXT NOT NULL,
    "toPlan" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "requestedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "channel" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "decisionReason" TEXT,
    "decidedByPlatformUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromPlan" TEXT,
    "toPlan" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "mrrBefore" DECIMAL(12,2),
    "mrrAfter" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "source" TEXT NOT NULL,
    "stripeEventId" TEXT,
    "planChangeRequestId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_change_requests_status_createdAt_idx" ON "plan_change_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "plan_change_requests_tenantId_createdAt_idx" ON "plan_change_requests"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_events_stripeEventId_key" ON "subscription_events"("stripeEventId");

-- CreateIndex
CREATE INDEX "subscription_events_tenantId_occurredAt_idx" ON "subscription_events"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "subscription_events_type_occurredAt_idx" ON "subscription_events"("type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "save_offers_code_key" ON "save_offers"("code");

-- AddForeignKey
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

