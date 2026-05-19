ALTER TABLE "refunds" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "refunds_idempotencyKey_key" ON "refunds"("idempotencyKey");
