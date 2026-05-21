-- Tenant slug history and widget custom-domain store.
-- Shared tables use snake_case names/columns because @fauward/tenant-db reads them
-- directly through Supabase while the backend writes through Prisma.

CREATE TABLE IF NOT EXISTS "tenant_slug_history" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "old_slug" TEXT NOT NULL,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_slug_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_slug_history_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_slug_history_old_slug_key"
  ON "tenant_slug_history"("old_slug");

CREATE INDEX IF NOT EXISTS "tenant_slug_history_tenant_id_idx"
  ON "tenant_slug_history"("tenant_id");

CREATE INDEX IF NOT EXISTS "tenant_slug_history_expires_at_idx"
  ON "tenant_slug_history"("expires_at");

CREATE TABLE IF NOT EXISTS "tenant_widget_domains" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "host" TEXT NOT NULL,
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_widget_domains_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_widget_domains_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_widget_domains_host_key"
  ON "tenant_widget_domains"("host");

CREATE INDEX IF NOT EXISTS "tenant_widget_domains_tenant_id_idx"
  ON "tenant_widget_domains"("tenant_id");
