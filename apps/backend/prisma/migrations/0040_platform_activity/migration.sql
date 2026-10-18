-- Console activity feed (spec label 0043_platform_activity; renumbered at creation, C11). Additive.
-- PlatformActivity is written in the producer's transaction by recordActivity(); OutboxEvent.tenantId lets the
-- outbox worker project shipment/tenant events per tenant.
-- CreateEnum
CREATE TYPE "ActivitySeverity" AS ENUM ('INFO', 'ATTENTION', 'CRITICAL');

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "tenantId" TEXT;

-- CreateTable
CREATE TABLE "platform_activity" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "service" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" "ActivitySeverity" NOT NULL DEFAULT 'INFO',
    "consoleLink" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "platform_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_activity_dedupeKey_key" ON "platform_activity"("dedupeKey");

-- CreateIndex
CREATE INDEX "platform_activity_tenantId_occurredAt_idx" ON "platform_activity"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "platform_activity_service_occurredAt_idx" ON "platform_activity"("service", "occurredAt");

-- CreateIndex
CREATE INDEX "platform_activity_severity_occurredAt_idx" ON "platform_activity"("severity", "occurredAt");

-- CreateIndex
CREATE INDEX "outbox_events_tenantId_createdAt_idx" ON "outbox_events"("tenantId", "createdAt");
