CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'OFFBOARDED');

CREATE TABLE "staff_users" (
  "id" TEXT NOT NULL,
  "platformUserId" TEXT,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ssoProvider" TEXT NOT NULL DEFAULT 'totp',
  "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
  "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  "hardwareKeyId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastLoginAt" TIMESTAMP(3),
  CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_roles" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "permissions" TEXT[],
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "deprecated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_role_assignments" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "grantedBy" TEXT,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "staff_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_sessions" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "platformSessionId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_users_platformUserId_key" ON "staff_users"("platformUserId");
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");
CREATE INDEX "staff_users_status_idx" ON "staff_users"("status");
CREATE UNIQUE INDEX "staff_role_assignments_staffId_roleId_key" ON "staff_role_assignments"("staffId", "roleId");
CREATE INDEX "staff_role_assignments_roleId_idx" ON "staff_role_assignments"("roleId");
CREATE INDEX "staff_role_assignments_expiresAt_idx" ON "staff_role_assignments"("expiresAt");
CREATE INDEX "staff_sessions_staffId_idx" ON "staff_sessions"("staffId");
CREATE INDEX "staff_sessions_expiresAt_idx" ON "staff_sessions"("expiresAt");
CREATE UNIQUE INDEX "staff_sessions_platformSessionId_key" ON "staff_sessions"("platformSessionId");

ALTER TABLE "staff_users"
  ADD CONSTRAINT "staff_users_platformUserId_fkey"
  FOREIGN KEY ("platformUserId") REFERENCES "platform_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "staff_role_assignments"
  ADD CONSTRAINT "staff_role_assignments_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "staff_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_role_assignments"
  ADD CONSTRAINT "staff_role_assignments_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "staff_roles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_sessions"
  ADD CONSTRAINT "staff_sessions_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "staff_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
