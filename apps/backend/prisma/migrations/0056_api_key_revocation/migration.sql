-- WP-2.13 (L9): API key revocation metadata (tenant or Fauward staff, reason). Additive.

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedById" TEXT,
ADD COLUMN     "revokedByType" TEXT,
ADD COLUMN     "revokedReason" TEXT;

