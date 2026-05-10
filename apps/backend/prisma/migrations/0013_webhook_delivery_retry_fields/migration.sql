ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "deadLetteredAt" TIMESTAMP(3);
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "hmacSignature" TEXT;
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "responseCode" INTEGER;
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "responseLatencyMs" INTEGER;
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3);
