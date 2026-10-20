-- One suspension path (spec label 0039_suspension_unification; renumbered at creation, C11). Additive.
-- Every cause of a suspension is one SuspensionRecord with its source/category, a public reason for the tenant and
-- how it was lifted. Tenants suspended without any record are backfilled by
-- src/scripts/backfills/0042-suspension-records.ts (spec label 0039-suspension-records).
-- AlterTable
ALTER TABLE "suspension_records" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "liftReason" TEXT,
ADD COLUMN     "liftedVia" TEXT,
ADD COLUMN     "publicReason" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'PLATFORM',
ADD COLUMN     "sourceRef" TEXT;

-- Existing rows were written only by the fraud decision route (sourceSignalId set).
UPDATE "suspension_records" SET "source" = 'FRAUD', "category" = 'FRAUD', "sourceRef" = "sourceSignalId" WHERE "sourceSignalId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "suspension_records_source_status_idx" ON "suspension_records"("source", "status");
