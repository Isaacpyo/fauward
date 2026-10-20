-- WP-2.3 (D5; spec label 0045_support_audience, renumbered at creation, C11): ticket audience (END_CUSTOMER vs
-- PLATFORM), message author type and visibility, last-message/first-response/SLA columns and the escalation link.
-- Additive: defaults keep every existing ticket END_CUSTOMER and every message PUBLIC/TENANT_USER until
-- src/scripts/backfills/0047-ticket-messages.ts maps isInternal/fromSA (dry-run first; production run needs owner approval).

-- CreateEnum
CREATE TYPE "TicketAudience" AS ENUM ('END_CUSTOMER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "MessageAuthorType" AS ENUM ('TENANT_USER', 'END_CUSTOMER', 'STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageVisibility" AS ENUM ('PUBLIC', 'TENANT_INTERNAL', 'STAFF_INTERNAL');

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "assignedPlatformUserId" TEXT,
ADD COLUMN     "audience" "TicketAudience" NOT NULL DEFAULT 'END_CUSTOMER',
ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "lastMessageAuthorType" "MessageAuthorType",
ADD COLUMN     "linkedTicketId" TEXT,
ADD COLUMN     "slaBreachedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ticket_messages" ADD COLUMN     "authorType" "MessageAuthorType" NOT NULL DEFAULT 'TENANT_USER',
ADD COLUMN     "visibility" "MessageVisibility" NOT NULL DEFAULT 'PUBLIC',
ALTER COLUMN "authorId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "support_tickets_audience_status_lastMessageAt_idx" ON "support_tickets"("audience", "status", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

