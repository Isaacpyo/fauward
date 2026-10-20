-- WP-2.5 (trust.compliance, L4): DSAR subject/identity/erasure columns, export storage + one-time download token,
-- POSTGRES storage adapter blobs, legal-hold release reason. Additive.

-- AlterTable
ALTER TABLE "dsar_requests" ADD COLUMN     "erasureCompletedAt" TIMESTAMP(3),
ADD COLUMN     "identityVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "overdueAt" TIMESTAMP(3),
ADD COLUMN     "subjectUserId" TEXT;

-- AlterTable
ALTER TABLE "legal_holds" ADD COLUMN     "releaseReason" TEXT;

-- AlterTable
ALTER TABLE "compliance_exports" ADD COLUMN     "byteSize" INTEGER,
ADD COLUMN     "downloadTokenHash" TEXT,
ADD COLUMN     "downloadedAt" TIMESTAMP(3),
ADD COLUMN     "error" TEXT,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "storageProvider" TEXT;

-- CreateTable
CREATE TABLE "export_blobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_blobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "export_blobs_tenantId_idx" ON "export_blobs"("tenantId");

