-- WP-5.2 (spec "0064_legal_hold_global"; 0064 was taken, C115): a hold without a tenant applies to every tenant only
-- when appliesToAllTenants is true. Holds placed before 0081 without a tenant were already treated as global, so they
-- keep that effect (a hold is never dropped silently).

ALTER TABLE "legal_holds" ADD COLUMN "appliesToAllTenants" BOOLEAN NOT NULL DEFAULT false;

UPDATE "legal_holds" SET "appliesToAllTenants" = true WHERE "tenantId" IS NULL;

ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_tenant_or_global_check" CHECK (("tenantId" IS NULL) = "appliesToAllTenants");
