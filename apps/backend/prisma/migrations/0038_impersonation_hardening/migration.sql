-- Impersonation hardening (spec label 0037_impersonation_hardening; renumbered, C11).
-- One-time exchange code redemption, explicit end time/reason, tenant opt-out of staff-access email.
-- AlterTable
ALTER TABLE "platform_impersonation_sessions" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "endedReason" TEXT,
ADD COLUMN     "exchangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "notifyOnStaffAccess" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "platform_impersonation_sessions_targetTenantId_createdAt_idx" ON "platform_impersonation_sessions"("targetTenantId", "createdAt");

