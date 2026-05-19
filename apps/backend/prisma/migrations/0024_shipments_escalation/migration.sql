-- Add escalation tracking columns to shipments for fast real-time queries

ALTER TABLE "shipments"
  ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "escalation_flag" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "escalation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "escalation_flagged_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "escalation_resolved_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "escalation_resolved_by" TEXT;

CREATE INDEX "shipments_open_escalations"
  ON "shipments" ("escalation_flagged_at" DESC)
  WHERE "escalation_flag" = true;
