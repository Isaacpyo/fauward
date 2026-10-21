-- platform.incidents (WP-4.2): native incidents. vendorId becomes optional (native rows have none), new rows default to
-- vendor 'native', commander/public summary/announcement/creator/linked runbooks, and an IncidentUpdate timeline.
-- AlterTable
ALTER TABLE "incident_records" ADD COLUMN     "announcementId" TEXT,
ADD COLUMN     "commanderPlatformUserId" TEXT,
ADD COLUMN     "createdByPlatformUserId" TEXT,
ADD COLUMN     "publicSummary" TEXT,
ADD COLUMN     "runbookIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "vendor" SET DEFAULT 'native',
ALTER COLUMN "vendorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "incident_updates" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_updates_incidentId_createdAt_idx" ON "incident_updates"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "incident_records_resolvedAt_idx" ON "incident_records"("resolvedAt");

-- AddForeignKey
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incident_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing PagerDuty rows move to the native vocabulary (status INVESTIGATING/IDENTIFIED/RESOLVED, severity SEV1-SEV4),
-- the same mapping the webhook now applies.
UPDATE "incident_records" SET "status" = CASE lower("status")
    WHEN 'triggered' THEN 'INVESTIGATING'
    WHEN 'acknowledged' THEN 'IDENTIFIED'
    WHEN 'resolved' THEN 'RESOLVED'
    ELSE "status" END
WHERE lower("status") IN ('triggered', 'acknowledged', 'resolved');
UPDATE "incident_records" SET "resolvedAt" = COALESCE("resolvedAt", "updatedAt") WHERE "status" = 'RESOLVED';
UPDATE "incident_records" SET "severity" = CASE lower("severity")
    WHEN 'high' THEN 'SEV2'
    WHEN 'medium' THEN 'SEV3'
    WHEN 'low' THEN 'SEV3'
    ELSE "severity" END
WHERE lower("severity") IN ('high', 'medium', 'low');
