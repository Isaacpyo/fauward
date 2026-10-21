-- trust.secrets (WP-4.12): secret inventory. Rows are written by the trust.secret-inventory job from config/secret-registry.ts;
-- only a fingerprint (first 12 hex of sha256) is stored, never a value. Additive.
-- AlterTable
ALTER TABLE "secret_credentials" ADD COLUMN     "configured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "envName" TEXT,
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "firstSeenAt" TIMESTAMP(3),
ADD COLUMN     "lastRotatedAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "rotateEveryDays" INTEGER,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ENV';

-- CreateIndex
CREATE UNIQUE INDEX "secret_credentials_envName_key" ON "secret_credentials"("envName");


-- Rows created before this migration came from Doppler (the only earlier producer, never wired) or by hand.
UPDATE "secret_credentials" SET "source" = CASE WHEN "dopplerId" IS NOT NULL THEN 'DOPPLER' ELSE 'MANUAL' END;
