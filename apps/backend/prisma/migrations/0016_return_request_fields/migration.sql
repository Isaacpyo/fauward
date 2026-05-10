ALTER TABLE "return_requests" ADD COLUMN IF NOT EXISTS "items" JSONB;
ALTER TABLE "return_requests" ADD COLUMN IF NOT EXISTS "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "return_requests" ADD COLUMN IF NOT EXISTS "labelId" TEXT;
ALTER TABLE "return_requests" ADD COLUMN IF NOT EXISTS "refundStatus" TEXT;
ALTER TABLE "return_requests" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);
ALTER TABLE "return_requests" ADD COLUMN IF NOT EXISTS "pickupScheduledAt" TIMESTAMP(3);

ALTER TABLE "return_requests" ALTER COLUMN "reason" DROP NOT NULL;
ALTER TABLE "return_requests" ALTER COLUMN "reason" TYPE TEXT USING "reason"::TEXT;
DROP TYPE IF EXISTS "ReturnReason";
