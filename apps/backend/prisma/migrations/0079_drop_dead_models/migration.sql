-- D10 (WP-4.0c; the spec's "0062", renumbered because 0062 is taken, C80): drop the 11 producer-less tables and the
-- legacy columns ticket_messages.isInternal/fromSA and tenant_settings.paymentGatewayKey. DESTRUCTIVE.
-- Before applying in any shared environment:
--   1. run backfills 0047 (ticket messages) and 0055 (payment gateways, with clearLegacy);
--   2. run `npx tsx src/scripts/backfills/0079-drop-dead-models-precheck.ts` and keep its output;
--      `legacyNotBackfilled` must be 0 for both, and every table count should be understood (data is lost).
-- The production run needs owner approval.

-- DropForeignKey
ALTER TABLE "commission_ledger" DROP CONSTRAINT "commission_ledger_partnerId_fkey";

-- DropForeignKey
ALTER TABLE "commission_payouts" DROP CONSTRAINT "commission_payouts_partnerId_fkey";

-- DropForeignKey
ALTER TABLE "partner_applications" DROP CONSTRAINT "partner_applications_partnerId_fkey";

-- DropForeignKey
ALTER TABLE "partner_deal_registrations" DROP CONSTRAINT "partner_deal_registrations_partnerId_fkey";

-- DropForeignKey
ALTER TABLE "secret_access_logs" DROP CONSTRAINT "secret_access_logs_secretId_fkey";

-- AlterTable
ALTER TABLE "tenant_settings" DROP COLUMN "paymentGatewayKey";

-- AlterTable
ALTER TABLE "ticket_messages" DROP COLUMN "fromSA",
DROP COLUMN "isInternal";

-- DropTable
DROP TABLE "commission_disputes";

-- DropTable
DROP TABLE "commission_ledger";

-- DropTable
DROP TABLE "commission_payouts";

-- DropTable
DROP TABLE "partner_applications";

-- DropTable
DROP TABLE "partner_deal_registrations";

-- DropTable
DROP TABLE "partners";

-- DropTable
DROP TABLE "pricing_experiments";

-- DropTable
DROP TABLE "qbr_templates";

-- DropTable
DROP TABLE "secret_access_logs";

-- DropTable
DROP TABLE "support_vendor_tickets";

-- DropTable
DROP TABLE "tax_returns";
