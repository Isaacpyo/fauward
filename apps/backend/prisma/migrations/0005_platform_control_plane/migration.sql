CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_OPERATIONS', 'PLATFORM_FINANCE', 'PLATFORM_READONLY');
CREATE TYPE "PlatformUserStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "platform_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "status" "PlatformUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEncrypted" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),
    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_sessions" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "mfaVerifiedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_impersonation_sessions" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "targetTenantId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_impersonation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_plan_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" "TenantPlan" NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdByPlatformUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_plan_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetTenantId" TEXT,
    "targetUserId" TEXT,
    "impersonationSessionId" TEXT,
    "reason" TEXT,
    "metadata" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");
CREATE INDEX "platform_users_status_idx" ON "platform_users"("status");
CREATE INDEX "platform_sessions_platformUserId_idx" ON "platform_sessions"("platformUserId");
CREATE INDEX "platform_sessions_expiresAt_idx" ON "platform_sessions"("expiresAt");
CREATE INDEX "platform_impersonation_sessions_platformUserId_idx" ON "platform_impersonation_sessions"("platformUserId");
CREATE INDEX "platform_impersonation_sessions_targetTenantId_idx" ON "platform_impersonation_sessions"("targetTenantId");
CREATE INDEX "platform_impersonation_sessions_expiresAt_idx" ON "platform_impersonation_sessions"("expiresAt");
CREATE INDEX "tenant_plan_overrides_tenantId_revokedAt_expiresAt_idx" ON "tenant_plan_overrides"("tenantId", "revokedAt", "expiresAt");
CREATE INDEX "platform_audit_logs_createdAt_idx" ON "platform_audit_logs"("createdAt");
CREATE INDEX "platform_audit_logs_targetTenantId_createdAt_idx" ON "platform_audit_logs"("targetTenantId", "createdAt");

ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_impersonation_sessions" ADD CONSTRAINT "platform_impersonation_sessions_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_impersonation_sessions" ADD CONSTRAINT "platform_impersonation_sessions_targetTenantId_fkey" FOREIGN KEY ("targetTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_plan_overrides" ADD CONSTRAINT "tenant_plan_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_plan_overrides" ADD CONSTRAINT "tenant_plan_overrides_createdByPlatformUserId_fkey" FOREIGN KEY ("createdByPlatformUserId") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
