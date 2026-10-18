-- Billing ledger kind (spec label 0040_ledger_kind; renumbered at creation, C11). Additive: every existing row is
-- TENANT_CUSTOMER by default; rows created by the console billing routes are re-tagged PLATFORM by
-- src/scripts/backfills/0045-ledger-kind.ts (dry-run first; production run needs owner approval).
-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('PLATFORM', 'TENANT_CUSTOMER');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "kind" "LedgerKind" NOT NULL DEFAULT 'TENANT_CUSTOMER',
ADD COLUMN     "stripeInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "kind" "LedgerKind" NOT NULL DEFAULT 'TENANT_CUSTOMER';

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "kind" "LedgerKind" NOT NULL DEFAULT 'TENANT_CUSTOMER';

-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN     "kind" "LedgerKind" NOT NULL DEFAULT 'TENANT_CUSTOMER';

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripeInvoiceId_key" ON "invoices"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "invoices_kind_tenantId_createdAt_idx" ON "invoices"("kind", "tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_kind_tenantId_createdAt_idx" ON "payments"("kind", "tenantId", "createdAt");

