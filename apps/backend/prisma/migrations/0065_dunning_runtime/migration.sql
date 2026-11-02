-- revenue.dunning (WP-4.5): runtime enrolments and a default sequence. Additive. The sequence's SUSPEND step becomes the only
-- billing suspension trigger (Stripe attempt 2 no longer suspends).
-- AlterTable
ALTER TABLE "dunning_sequences" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "dunning_enrollments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'STRIPE',
    "sequenceId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextActionAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "pausedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dunning_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dunning_enrollments_status_nextActionAt_idx" ON "dunning_enrollments"("status", "nextActionAt");

-- CreateIndex
CREATE INDEX "dunning_enrollments_tenantId_createdAt_idx" ON "dunning_enrollments"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "dunning_enrollments_invoiceId_key" ON "dunning_enrollments"("invoiceId");

-- AddForeignKey
ALTER TABLE "dunning_enrollments" ADD CONSTRAINT "dunning_enrollments_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "dunning_sequences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Default sequence (day 0 email, day 3 email, day 7 email + in-app, day 14 suspend), unless a default already exists.
-- The backend creates the same rows on first use for databases built with `prisma db push`.
INSERT INTO "dunning_sequences" ("id", "name", "steps", "active", "isDefault", "createdAt", "updatedAt")
SELECT 'dunning-default', 'Default dunning', '[]'::jsonb, true, true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "dunning_sequences" WHERE "isDefault")
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "dunning_steps" ("id", "sequenceId", "dayOffset", "action", "template", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'dunning-default', step.day, step.action, step.template, now(), now()
FROM (VALUES (0, 'EMAIL', 'billing_payment_failed'), (3, 'EMAIL', 'billing_payment_failed'), (7, 'EMAIL_IN_APP', 'billing_final_warning'), (14, 'SUSPEND', 'tenant_suspended')) AS step(day, action, template)
WHERE EXISTS (SELECT 1 FROM "dunning_sequences" WHERE "id" = 'dunning-default')
  AND NOT EXISTS (SELECT 1 FROM "dunning_steps" WHERE "sequenceId" = 'dunning-default');
