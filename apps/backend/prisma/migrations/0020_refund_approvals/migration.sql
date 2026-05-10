CREATE TABLE "refund_approvals" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "refund_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refund_approvals_refundId_idx" ON "refund_approvals"("refundId");
CREATE INDEX "refund_approvals_status_idx" ON "refund_approvals"("status");

ALTER TABLE "refund_approvals"
  ADD CONSTRAINT "refund_approvals_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "refunds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
