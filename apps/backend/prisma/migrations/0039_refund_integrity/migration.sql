-- Refund integrity (spec label 0038_refund_integrity; renumbered, C11).
-- Refund currency is copied from the payment; failureReason holds the vendor error for FAILED refunds.
-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "failureReason" TEXT;

