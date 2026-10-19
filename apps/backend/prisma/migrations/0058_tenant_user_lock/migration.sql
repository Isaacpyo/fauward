-- WP-2.15 (L13): console lock/unlock of a tenant user (security incidents). Additive.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedByPlatformUserId" TEXT,
ADD COLUMN     "lockedReason" TEXT;

