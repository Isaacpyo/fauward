ALTER TABLE "platform_audit_logs"
  ADD COLUMN IF NOT EXISTS "actorRole" TEXT,
  ADD COLUMN IF NOT EXISTS "targetType" TEXT,
  ADD COLUMN IF NOT EXISTS "targetId" TEXT,
  ADD COLUMN IF NOT EXISTS "sessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "jitSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "before" JSONB,
  ADD COLUMN IF NOT EXISTS "after" JSONB;

CREATE INDEX IF NOT EXISTS "platform_audit_logs_targetType_targetId_createdAt_idx"
  ON "platform_audit_logs"("targetType", "targetId", "createdAt");

CREATE INDEX IF NOT EXISTS "platform_audit_logs_sessionId_createdAt_idx"
  ON "platform_audit_logs"("sessionId", "createdAt");
