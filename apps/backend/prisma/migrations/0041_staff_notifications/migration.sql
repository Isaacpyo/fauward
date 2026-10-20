-- Console bell (spec label 0044_staff_notifications; renumbered at creation, C11). Additive.
-- CreateTable
CREATE TABLE "staff_notifications" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "severity" "ActivitySeverity" NOT NULL DEFAULT 'INFO',
    "tenantId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_notifications_platformUserId_readAt_createdAt_idx" ON "staff_notifications"("platformUserId", "readAt", "createdAt");
