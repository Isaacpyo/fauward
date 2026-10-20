-- WP-2.14 (L8): announcement edits/archive/alsoEmail and per-user receipts (viewed/dismissed/CTA). Additive.

-- AlterTable
ALTER TABLE "platform_announcements" ADD COLUMN     "alsoEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "announcement_receipts" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),
    "ctaClickedAt" TIMESTAMP(3),

    CONSTRAINT "announcement_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcement_receipts_announcementId_idx" ON "announcement_receipts"("announcementId");

-- CreateIndex
CREATE INDEX "announcement_receipts_tenantId_idx" ON "announcement_receipts"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_receipts_announcementId_userId_key" ON "announcement_receipts"("announcementId", "userId");

-- AddForeignKey
ALTER TABLE "announcement_receipts" ADD CONSTRAINT "announcement_receipts_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "platform_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

