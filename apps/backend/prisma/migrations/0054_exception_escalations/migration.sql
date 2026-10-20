-- WP-2.11 (L15): tenant escalations of exception cases to Fauward (escalation columns) and staff replies. Additive.

-- AlterTable
ALTER TABLE "exception_cases" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedByUserId" TEXT,
ADD COLUMN     "escalationReason" TEXT,
ADD COLUMN     "platformAssigneeId" TEXT,
ADD COLUMN     "platformResolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "exception_escalation_replies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exception_escalation_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exception_escalation_replies_tenantId_exceptionId_createdAt_idx" ON "exception_escalation_replies"("tenantId", "exceptionId", "createdAt");

-- CreateIndex
CREATE INDEX "exception_cases_escalatedAt_idx" ON "exception_cases"("escalatedAt");

-- AddForeignKey
ALTER TABLE "exception_escalation_replies" ADD CONSTRAINT "exception_escalation_replies_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "exception_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

