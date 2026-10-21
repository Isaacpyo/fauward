-- L2 Relay (WP-4.R): a Relay conversation converted to a PLATFORM support ticket links to it (one ticket per
-- conversation). Additive.
-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "relayConversationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_relayConversationId_key" ON "support_tickets"("relayConversationId");
