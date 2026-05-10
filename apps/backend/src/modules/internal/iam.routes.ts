import type { FastifyInstance, FastifyRequest } from 'fastify';
import { PERMISSIONS, type Permission } from '@fauward/internal-rbac';
import { writeAudit } from '@fauward/internal-audit';
import type { PlatformAuditClient } from '@fauward/internal-audit';
import { PlatformRole } from '@prisma/client';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { requireInternalPermission } from '../../middleware/require-internal-permission.js';
import { hashPassword } from '../../shared/utils/hash.js';
import { generateQrCodeDataUrl, generateTotpSecret } from '../../shared/utils/totp.js';
import { seedStaffRoles, STAFF_ROLE_DEFINITIONS, staffPermissionContextForPlatformUser } from '../../services/staff-iam.service.js';

const mutationPre = [authenticatePlatformSession, requirePlatformCsrf];

function ipAddress(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return request.ip;
}

function userAgent(request: FastifyRequest) {
  return typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null;
}

async function auditIam(request: FastifyRequest, action: string, targetType: string, targetId: string, before: unknown, after: unknown, reason?: string | null) {
  const platform = request.platform;
  if (!platform) return;
  await writeAudit(request.server.prisma as unknown as PlatformAuditClient, {
    actor_id: platform.user.id,
    actor_email: platform.user.email,
    actor_role: platform.user.role,
    action,
    target_type: targetType,
    target_id: targetId,
    before,
    after,
    reason: reason ?? null,
    ip_address: ipAddress(request),
    session_id: platform.session.id,
    jit_session_id: null,
    user_agent: userAgent(request)
  });
}

function staffSelect() {
  return {
    roleAssignments: { include: { role: true }, orderBy: { grantedAt: 'desc' as const } },
    sessions: { orderBy: { startedAt: 'desc' as const }, take: 20 }
  };
}

export async function registerInternalIamRoutes(app: FastifyInstance) {
  await seedStaffRoles(app.prisma);

  app.get('/api/internal/iam/users', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.iam.read')] }, async (request, reply) => {
    const query = request.query as { search?: string; status?: 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED' };
    const users = await app.prisma.staffUser.findMany({
      where: {
        status: query.status,
        OR: query.search
          ? [
              { email: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } }
            ]
          : undefined
      },
      include: { roleAssignments: { include: { role: true } }, sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    reply.send({ data: users });
  });

  app.get('/api/internal/iam/users/:id', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.iam.read')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = await app.prisma.staffUser.findUnique({ where: { id }, include: staffSelect() });
    if (!user) return reply.status(404).send({ error: 'Staff user not found' });
    reply.send(user);
  });

  app.post('/api/internal/iam/users', { preHandler: [...mutationPre, requireInternalPermission('trust.iam.write')] }, async (request, reply) => {
    const body = request.body as { email?: string; name?: string; password?: string; roleIds?: string[]; ssoProvider?: string; reason?: string };
    if (!body.email || !body.name || !body.password) return reply.status(400).send({ error: 'email, name, and password are required' });
    const normalizedEmail = body.email.toLowerCase().trim();
    const roleIds = body.roleIds?.length ? body.roleIds : ['EXECUTIVE'];
    if (roleIds.includes('ROOT') && !(await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user)).permissions.includes('trust.iam.root')) {
      return reply.status(403).send({ error: 'trust.iam.root is required to grant ROOT' });
    }

    const created = await app.prisma.$transaction(async (tx) => {
      const platformUser = await tx.platformUser.create({
        data: {
          email: normalizedEmail,
          name: body.name,
          passwordHash: await hashPassword(body.password!),
          role: roleIds.includes('ROOT') ? PlatformRole.SUPER_ADMIN : PlatformRole.PLATFORM_READONLY,
          mfaEnabled: roleIds.includes('ROOT')
        }
      });
      const staff = await tx.staffUser.create({
        data: {
          platformUserId: platformUser.id,
          email: normalizedEmail,
          name: body.name!,
          ssoProvider: body.ssoProvider ?? (roleIds.includes('ROOT') ? 'root' : 'totp'),
          mfaEnabled: roleIds.includes('ROOT')
        }
      });
      await tx.staffRoleAssignment.createMany({
        data: roleIds.map((roleId) => ({ staffId: staff.id, roleId, grantedBy: request.platform!.user.id })),
        skipDuplicates: true
      });
      return tx.staffUser.findUniqueOrThrow({ where: { id: staff.id }, include: staffSelect() });
    });

    await auditIam(request, 'staff.user.create', 'staff_user', created.id, null, created, body.reason);
    reply.status(201).send(created);
  });

  app.patch('/api/internal/iam/users/:id', { preHandler: [...mutationPre, requireInternalPermission('trust.iam.write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; status?: 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED'; mfaEnabled?: boolean; reason?: string };
    const before = await app.prisma.staffUser.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'Staff user not found' });
    const after = await app.prisma.staffUser.update({
      where: { id },
      data: {
        name: body.name,
        status: body.status,
        mfaEnabled: body.mfaEnabled
      },
      include: staffSelect()
    });
    if (before.platformUserId) {
      await app.prisma.platformUser.updateMany({
        where: { id: before.platformUserId },
        data: { name: body.name, status: body.status === 'OFFBOARDED' ? 'DISABLED' : undefined, mfaEnabled: body.mfaEnabled }
      });
    }
    await auditIam(request, 'staff.user.update', 'staff_user', id, before, after, body.reason);
    reply.send(after);
  });

  app.delete('/api/internal/iam/users/:id', { preHandler: [...mutationPre, requireInternalPermission('trust.iam.write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await app.prisma.staffUser.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'Staff user not found' });
    const after = await app.prisma.staffUser.update({ where: { id }, data: { status: 'OFFBOARDED' }, include: staffSelect() });
    if (before.platformUserId) {
      await app.prisma.platformUser.updateMany({ where: { id: before.platformUserId }, data: { status: 'DISABLED', disabledAt: new Date() } });
      await app.prisma.platformSession.updateMany({ where: { platformUserId: before.platformUserId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await auditIam(request, 'staff.user.offboard', 'staff_user', id, before, after, (request.body as { reason?: string } | undefined)?.reason);
    reply.send(after);
  });

  app.get('/api/internal/iam/roles', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.iam.read')] }, async (_request, reply) => {
    await seedStaffRoles(app.prisma);
    const roles = await app.prisma.staffRole.findMany({ include: { _count: { select: { assignments: true } } }, orderBy: { id: 'asc' } });
    reply.send({ data: roles });
  });

  app.get('/api/internal/iam/roles/:id', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.iam.read')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const role = await app.prisma.staffRole.findUnique({ where: { id }, include: { assignments: { include: { staff: true } } } });
    if (!role) return reply.status(404).send({ error: 'Staff role not found' });
    reply.send(role);
  });

  app.post('/api/internal/iam/role-assignments', { preHandler: [...mutationPre, requireInternalPermission('trust.iam.write')] }, async (request, reply) => {
    const body = request.body as { staffId?: string; roleId?: string; expiresAt?: string; reason?: string };
    if (!body.staffId || !body.roleId) return reply.status(400).send({ error: 'staffId and roleId are required' });
    if (body.staffId === request.platform!.user.id) return reply.status(403).send({ error: 'Staff cannot grant roles to themselves' });
    if (body.roleId === 'ROOT' && !(await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user)).permissions.includes('trust.iam.root')) {
      return reply.status(403).send({ error: 'trust.iam.root is required to grant ROOT' });
    }
    const assignment = await app.prisma.staffRoleAssignment.create({
      data: {
        staffId: body.staffId,
        roleId: body.roleId,
        grantedBy: request.platform!.user.id,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
      },
      include: { role: true, staff: true }
    });
    await auditIam(request, 'staff.role.assign', 'staff_role_assignment', assignment.id, null, assignment, body.reason);
    reply.status(201).send(assignment);
  });

  app.delete('/api/internal/iam/role-assignments/:id', { preHandler: [...mutationPre, requireInternalPermission('trust.iam.write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await app.prisma.staffRoleAssignment.findUnique({ where: { id }, include: { role: true, staff: true } });
    if (!before) return reply.status(404).send({ error: 'Role assignment not found' });
    if (before.staff.platformUserId === request.platform!.user.id) return reply.status(403).send({ error: 'Staff cannot revoke roles from themselves' });
    await app.prisma.staffRoleAssignment.delete({ where: { id } });
    await auditIam(request, 'staff.role.revoke', 'staff_role_assignment', id, before, null, (request.body as { reason?: string } | undefined)?.reason);
    reply.status(204).send();
  });

  app.get('/api/internal/iam/permissions', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.iam.read')] }, async (_request, reply) => {
    reply.send({ data: PERMISSIONS });
  });

  app.post('/api/internal/iam/users/:id/totp-enrollment', { preHandler: [...mutationPre, requireInternalPermission('trust.iam.write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const staff = await app.prisma.staffUser.findUnique({ where: { id } });
    if (!staff) return reply.status(404).send({ error: 'Staff user not found' });
    const secret = generateTotpSecret(staff.email);
    const qrCode = await generateQrCodeDataUrl(secret.otpauth);
    await app.prisma.staffUser.update({ where: { id }, data: { mfaEnabled: true } });
    if (staff.platformUserId) await app.prisma.platformUser.update({ where: { id: staff.platformUserId }, data: { mfaEnabled: true, mfaSecretEncrypted: secret.secret } });
    await auditIam(request, 'staff.totp.enroll', 'staff_user', id, { mfaEnabled: staff.mfaEnabled }, { mfaEnabled: true }, null);
    reply.send({ otpauth: secret.otpauth, qrCode });
  });

  app.post('/api/internal/iam/sso/google/callback', { preHandler: [...mutationPre, requireInternalPermission('trust.iam.write')] }, async (request, reply) => {
    const body = request.body as { email?: string; name?: string; googleSubject?: string; reason?: string };
    if (!body.email || !body.name) return reply.status(400).send({ error: 'email and name are required' });
    const staff = await app.prisma.staffUser.upsert({
      where: { email: body.email.toLowerCase().trim() },
      create: { email: body.email.toLowerCase().trim(), name: body.name, ssoProvider: 'google' },
      update: { name: body.name, ssoProvider: 'google' },
      include: staffSelect()
    });
    await auditIam(request, 'staff.sso.google.callback', 'staff_user', staff.id, null, { id: staff.id, googleSubject: body.googleSubject ?? null }, body.reason);
    reply.send(staff);
  });

  app.get('/api/internal/iam/role-catalog', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.iam.read')] }, async (_request, reply) => {
    reply.send({ data: STAFF_ROLE_DEFINITIONS });
  });
}
