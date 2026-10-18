-- WP-2.8 (customer.feedback, L12): feedback items (NPS, feature requests, bugs), comments, NPS prompt state. Additive.

-- CreateTable
CREATE TABLE "feedback_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "score" INTEGER,
    "title" TEXT,
    "body" TEXT,
    "featureKey" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "assignedPlatformUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_comments" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibleToTenant" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nps_prompt_states" (
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eligibleAt" TIMESTAMP(3),
    "lastPromptedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "lastRespondedAt" TIMESTAMP(3),

    CONSTRAINT "nps_prompt_states_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "feedback_items_type_status_createdAt_idx" ON "feedback_items"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_items_tenantId_createdAt_idx" ON "feedback_items"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_comments_feedbackId_createdAt_idx" ON "feedback_comments"("feedbackId", "createdAt");

-- CreateIndex
CREATE INDEX "nps_prompt_states_tenantId_idx" ON "nps_prompt_states"("tenantId");

-- AddForeignKey
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

