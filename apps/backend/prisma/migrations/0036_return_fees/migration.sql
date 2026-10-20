-- Return-fee fields were added to schema.prisma (ReturnRequest) without a migration, so every
-- returnRequest query failed with P2022 "column does not exist".

-- CreateEnum
CREATE TYPE "ReturnPaymentStatus" AS ENUM ('NONE', 'INVOICE_SENT', 'PAID', 'WAIVED');

-- AlterTable
ALTER TABLE "return_requests" ADD COLUMN     "feeCurrency" TEXT NOT NULL DEFAULT 'GBP',
ADD COLUMN     "feeEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "feePaidAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "ReturnPaymentStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "returnFee" DECIMAL(12,2),
ADD COLUMN     "returnPickupShipmentId" TEXT,
ADD COLUMN     "stripeSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_returnPickupShipmentId_key" ON "return_requests"("returnPickupShipmentId");

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_returnPickupShipmentId_fkey" FOREIGN KEY ("returnPickupShipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
