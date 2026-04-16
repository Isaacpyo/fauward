-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'LABEL_ISSUED', 'PICKED_UP', 'IN_HUB', 'RECEIVED', 'REFUNDED', 'RESOLVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReturnReason" AS ENUM ('WRONG_ITEM', 'DAMAGED', 'NOT_AS_DESCRIBED', 'NO_LONGER_NEEDED', 'REFUSED_DELIVERY', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TicketCategory" AS ENUM ('DELIVERY_ISSUE', 'PAYMENT_ISSUE', 'DAMAGED_GOODS', 'WRONG_ADDRESS', 'TRACKING_ISSUE', 'RETURN_REQUEST', 'BILLING_QUERY', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SurchargeType" AS ENUM ('PERCENT_OF_BASE', 'PERCENT_OF_TOTAL', 'FLAT_FEE', 'PER_KG');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SurchargeCondition" AS ENUM ('ALWAYS', 'OVERSIZE', 'OVERWEIGHT', 'REMOTE_AREA', 'RESIDENTIAL', 'DANGEROUS_GOODS', 'FUEL', 'PEAK_SEASON');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PricingRuleAction" AS ENUM ('ADD', 'SUBTRACT', 'MULTIPLY', 'OVERRIDE_TOTAL', 'OVERRIDE_PER_KG', 'SET_MIN', 'SET_MAX');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PromoType" AS ENUM ('PERCENT_OFF', 'FIXED_OFF', 'FREE_INSURANCE', 'FREE_EXPRESS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "tenant_settings"
  ADD COLUMN IF NOT EXISTS "emailFromName" TEXT,
  ADD COLUMN IF NOT EXISTS "emailReplyTo" TEXT,
  ADD COLUMN IF NOT EXISTS "opsEmailRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "serviceTierConfig" JSONB,
  ADD COLUMN IF NOT EXISTS "insuranceConfig" JSONB,
  ADD COLUMN IF NOT EXISTS "taxConfig" JSONB,
  ADD COLUMN IF NOT EXISTS "dimensionalDivisor" INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS "weightTierConflictPolicy" TEXT NOT NULL DEFAULT 'BEST_FOR_CUSTOMER',
  ADD COLUMN IF NOT EXISTS "quoteValidityMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "showPriceBreakdownToCustomer" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "autoInvoiceOnDelivery" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "slaDeliveryHours" INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS "roundingMode" TEXT NOT NULL DEFAULT 'ROUND_HALF_UP',
  ADD COLUMN IF NOT EXISTS "roundingPrecision" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "shipments"
  ADD COLUMN IF NOT EXISTS "promoCodeId" TEXT;

-- AlterTable
ALTER TABLE "rate_cards"
  ADD COLUMN IF NOT EXISTS "minCharge" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "maxCharge" DECIMAL(12,2);

-- CreateTable
CREATE TABLE IF NOT EXISTS "surcharges" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "SurchargeType" NOT NULL,
  "condition" "SurchargeCondition" NOT NULL,
  "value" DECIMAL(10,4) NOT NULL,
  "threshold" DECIMAL(10,2),
  "peakFrom" TIMESTAMP(3),
  "peakTo" TIMESTAMP(3),
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isVisibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "surcharges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "weight_discount_tiers" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT,
  "minWeightKg" DECIMAL(8,2) NOT NULL,
  "maxWeightKg" DECIMAL(8,2),
  "discountType" TEXT NOT NULL DEFAULT 'PERCENT',
  "discountValue" DECIMAL(8,4) NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weight_discount_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pricing_rules" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "conditions" JSONB NOT NULL,
  "action" "PricingRuleAction" NOT NULL,
  "actionValue" DECIMAL(12,4) NOT NULL,
  "stopAfter" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "promo_codes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "type" "PromoType" NOT NULL,
  "value" DECIMAL(10,2) NOT NULL,
  "minOrderValue" DECIMAL(10,2),
  "maxDiscountValue" DECIMAL(10,2),
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "customerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "return_requests" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "organisationId" TEXT,
  "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" "ReturnReason" NOT NULL,
  "notes" TEXT,
  "returnLabel" TEXT,
  "handledBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketNumber" TEXT NOT NULL,
  "customerId" TEXT,
  "shipmentId" TEXT,
  "subject" TEXT NOT NULL,
  "category" "TicketCategory" NOT NULL,
  "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
  "assignedTo" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ticket_messages" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "email_template_configs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "customSubject" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_template_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "in_app_notifications" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "link" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "promo_codes_tenantId_code_key" ON "promo_codes"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_ticketNumber_key" ON "support_tickets"("ticketNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "email_template_configs_tenantId_templateKey_key" ON "email_template_configs"("tenantId", "templateKey");

CREATE INDEX IF NOT EXISTS "shipments_promoCodeId_idx" ON "shipments"("promoCodeId");
CREATE INDEX IF NOT EXISTS "surcharges_tenantId_idx" ON "surcharges"("tenantId");
CREATE INDEX IF NOT EXISTS "weight_discount_tiers_tenantId_idx" ON "weight_discount_tiers"("tenantId");
CREATE INDEX IF NOT EXISTS "pricing_rules_tenantId_idx" ON "pricing_rules"("tenantId");
CREATE INDEX IF NOT EXISTS "pricing_rules_tenantId_priority_idx" ON "pricing_rules"("tenantId", "priority");
CREATE INDEX IF NOT EXISTS "promo_codes_tenantId_idx" ON "promo_codes"("tenantId");
CREATE INDEX IF NOT EXISTS "return_requests_tenantId_idx" ON "return_requests"("tenantId");
CREATE INDEX IF NOT EXISTS "return_requests_shipmentId_idx" ON "return_requests"("shipmentId");
CREATE INDEX IF NOT EXISTS "return_requests_customerId_idx" ON "return_requests"("customerId");
CREATE INDEX IF NOT EXISTS "support_tickets_tenantId_idx" ON "support_tickets"("tenantId");
CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets"("status");
CREATE INDEX IF NOT EXISTS "support_tickets_assignedTo_idx" ON "support_tickets"("assignedTo");
CREATE INDEX IF NOT EXISTS "ticket_messages_tenantId_idx" ON "ticket_messages"("tenantId");
CREATE INDEX IF NOT EXISTS "ticket_messages_ticketId_idx" ON "ticket_messages"("ticketId");
CREATE INDEX IF NOT EXISTS "email_template_configs_tenantId_idx" ON "email_template_configs"("tenantId");
CREATE INDEX IF NOT EXISTS "in_app_notifications_tenantId_idx" ON "in_app_notifications"("tenantId");
CREATE INDEX IF NOT EXISTS "in_app_notifications_userId_isRead_idx" ON "in_app_notifications"("userId", "isRead");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shipments" ADD CONSTRAINT "shipments_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "surcharges" ADD CONSTRAINT "surcharges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "weight_discount_tiers" ADD CONSTRAINT "weight_discount_tiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_handledBy_fkey" FOREIGN KEY ("handledBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "email_template_configs" ADD CONSTRAINT "email_template_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
