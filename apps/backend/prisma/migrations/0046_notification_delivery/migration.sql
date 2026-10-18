-- WP-2.2 (D6): every NotificationLog row is written by the notification worker, one per BullMQ job (jobId), with the
-- transport and recipient; staff (platform) notifications have no tenant. Additive: new nullable/defaulted columns,
-- tenantId becomes optional (existing rows keep their tenant).

-- AlterTable
ALTER TABLE "notification_logs" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "platformUserId" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "recipient" TEXT,
ADD COLUMN     "template" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "tenantId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_jobId_key" ON "notification_logs"("jobId");

-- CreateIndex
CREATE INDEX "notification_logs_status_createdAt_idx" ON "notification_logs"("status", "createdAt");

