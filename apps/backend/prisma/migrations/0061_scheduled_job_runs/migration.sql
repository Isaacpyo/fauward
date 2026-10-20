-- WP-3.8 (platform.jobs): one row per scheduled-job execution. Additive.

-- CreateTable
CREATE TABLE "scheduled_job_runs" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "bullJobId" TEXT,
    "status" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "error" TEXT,
    "result" JSONB,

    CONSTRAINT "scheduled_job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_job_runs_jobName_startedAt_idx" ON "scheduled_job_runs"("jobName", "startedAt");

