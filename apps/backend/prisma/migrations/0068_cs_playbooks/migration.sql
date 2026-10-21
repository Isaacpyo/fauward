-- customer.success (WP-4.8): playbook triggers and run execution state. Additive.
-- AlterTable
ALTER TABLE "cs_playbooks" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "triggerValue" INTEGER;

-- AlterTable
ALTER TABLE "cs_playbook_runs" ADD COLUMN     "error" TEXT,
ADD COLUMN     "nextActionAt" TIMESTAMP(3),
ADD COLUMN     "startedBy" TEXT,
ADD COLUMN     "triggerSource" TEXT;

-- CreateIndex
CREATE INDEX "cs_playbook_runs_status_nextActionAt_idx" ON "cs_playbook_runs"("status", "nextActionAt");

-- CreateIndex
CREATE INDEX "cs_playbook_runs_playbookId_tenantId_createdAt_idx" ON "cs_playbook_runs"("playbookId", "tenantId", "createdAt");


-- Earlier playbooks used free-text triggers; anything not in the new vocabulary becomes MANUAL.
UPDATE "cs_playbooks" SET "trigger" = 'MANUAL' WHERE "trigger" NOT IN ('MANUAL', 'HEALTH_BELOW', 'TRIAL_ENDING', 'PAYMENT_FAILED');
