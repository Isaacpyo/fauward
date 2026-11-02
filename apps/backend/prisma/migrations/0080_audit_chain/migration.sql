-- WP-5.1 (S14, spec "0063_audit_chain"; 0063 was taken, C113): one hash scheme for platform_audit_logs.
-- Existing rows keep hashVersion 1 and get a seq in createdAt order; every later row is written with hashVersion 2 under
-- an advisory lock. The cut-over (last seq before the single scheme) is recorded so verification accepts v1 rows only
-- up to it.

ALTER TABLE "platform_audit_logs" ADD COLUMN "hashVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "platform_audit_logs" ADD COLUMN "seq" INTEGER;

WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn FROM "platform_audit_logs"
)
UPDATE "platform_audit_logs" AS p SET "seq" = ordered.rn FROM ordered WHERE p."id" = ordered."id";

CREATE SEQUENCE "platform_audit_logs_seq_seq" AS INTEGER OWNED BY "platform_audit_logs"."seq";
SELECT setval('"platform_audit_logs_seq_seq"', COALESCE((SELECT MAX("seq") FROM "platform_audit_logs"), 0) + 1, false);
ALTER TABLE "platform_audit_logs" ALTER COLUMN "seq" SET DEFAULT nextval('"platform_audit_logs_seq_seq"');
ALTER TABLE "platform_audit_logs" ALTER COLUMN "seq" SET NOT NULL;

CREATE UNIQUE INDEX "platform_audit_logs_seq_key" ON "platform_audit_logs"("seq");

CREATE TABLE "audit_chain_meta" (
    "id" TEXT NOT NULL,
    "cutoverSeq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_chain_meta_pkey" PRIMARY KEY ("id")
);

INSERT INTO "audit_chain_meta" ("id", "cutoverSeq")
SELECT 'platform_audit_logs', COALESCE(MAX("seq"), 0) FROM "platform_audit_logs";
