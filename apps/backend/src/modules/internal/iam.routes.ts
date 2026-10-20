import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PERMISSIONS } from '@fauward/internal-rbac';
import { writeAudit } from '@fauward/internal-audit';
import { PlatformRole, type StaffStatus } from '@prisma/client';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { requireInternalPermission } from '../../middleware/require-internal-permission.js';
import { dangerous } from '../../middleware/dangerous.js';
import { hashPassword } from '../../shared/utils/hash.js';
import { checkRootHardwareAssertion } from '../../services/root-grant.service.js';
import { platformAuditClient } from '../../services/platform-audit-client.js';
import { seedStaffRoles, STAFF_ROLE_DEFINITIONS, staffPermissionContextForPlatformUser } from '../../services/staff-iam.service.js';

const mutationPre = [authenticatePlatformSession, requirePlatformCsrf];
const ROOT_EQUIVALENT_ROLES = new Set(['ROOT', 'SUPER_ADMIN']);

function ipAddress(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return request.ip;
}

function userAgent(request: FastifyRequest) {
  return typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null;
}

function reasonOf(request: FastifyRequest) {
  const reason = (request.body as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' ? reason.trim() : null;
}

/** ROOT (and the deprecated ROOT-equivalent SUPER_ADMIN role) needs trust.iam.root plus a hardware-key assertion (S2). */
async function requireRootGrantAuthorization(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  roleIds: readonly string[],
  hardwareKeyAssertion?: string
) {
  if (!roleIds.some((roleId) => ROOT_EQUIVALENT_ROLES.has(roleId))) return null;

  const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
  if (!context.permissions.includes('trust.iam.root')) {
    reply.status(403).send({ error: 'Forbidden', permission: 'trust.iam.root', message: 'trust.iam.root is required to grant ROOT' });
    return false;
  }

  const check = checkRootHardwareAssertion(hardwareKeyAssertion);
  if (!check.ok) {
    reply.status(check.status).send({ error: check.error, message: check.message });
    return false;
  }
  return check.fingerprint;
}

/** The caller's StaffUser id: role assignments and self-checks compare StaffUser ids, never PlatformUser ids (S3). */
async function callerStaffId(app: FastifyInstance, request: FastifyRequest) {
  const staff = await app.prisma.staffUser.findUnique({ where: { platformUserId: request.platform!.user.id }, select: { id: true } });
  return staff?.id ?? null;
}

async function auditIam(request: FastifyRequest, action: string, targetType: string, targetId: string, before: unknown, after: unknown, reason?: string | null) {
  const platform = request.platform;
  if (!platform) return;
  await writeAudit(platformAuditClient(request.server.prisma), {
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

const LIFECYCLE: Record<'suspend' | 'offboard' | 'reactivate', { next: StaffStatus; action: string }> = {
  suspend: { next: 'SUSPENDED', action: 'staff.user.suspend' },
  offboard: { next: 'OFFBOARDED', action: 'staff.user.offboard' },
  reactivate: { next: 'ACTIVE', action: 'staff.user.reactivate' }
};

/**
 * Suspend / offboard / reactivate in one transaction (S4): StaffUser.status, PlatformUser.status and — unless
 * reactivating — revocation of every console session. Offboarding is final.
 */
async function changeStaffStatus(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply, kind: keyof typeof LIFECYCLE) {
  const { id } = request.params as { id: string };
  const { next, action } = LIFECYCLE[kind];
  const reason = reasonOf(request);
  const before = await app.prisma.staffUser.findUnique({ where: { id } });
  if (!before) return reply.status(404).send({ error: 'Staff user not found' });
  if (before.platformUserId === request.platform!.user.id) {
    return reply.status(403).send({ error: 'CANNOT_TARGET_SELF', message: 'Staff cannot change their own account status.' });
  }
  if (before.status === 'OFFBOARDED' && next !== 'OFFBOARDED') {
    return reply.status(409).send({ error: 'STAFF_OFFBOARDED', message: 'Offboarded staff cannot be reactivated; create a new account.' });
  }

  const now = new Date();
  const after = await app.prisma.$transaction(async (tx) => {
    if (before.platformUserId) {
      await tx.platformUser.update({
        where: { id: before.platformUserId },
        data: next === 'ACTIVE' ? { status: 'ACTIVE', disabledAt: null } : { status: 'DISABLED', disabledAt: now }
      });
      if (next !== 'ACTIVE') {
        await tx.platformSession.updateMany({ where: { platformUserId: before.platformUserId, revokedAt: null }, data: { revokedAt: now } });
      }
    }
    if (next !== 'ACTIVE') {
      await tx.staffSession.updateMany({ where: { staffId: id, revokedAt: null }, data: { revokedAt: now } });
    }
    return tx.staffUser.update({ where: { id }, data: { status: next }, include: staffSelect() });
  });

  await auditIam(request, action, 'staff_user', id, { status: before.status }, { status: next, sessionsRevoked: next !== 'ACTIVE' }, reason);
  return reply.send(after);
}

export async function registerInternalIamRoutes(app: FastifyInstance) {
  // Seeded once at boot (and by `npm run staff:roles:seed`), never per request (S5).
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
    const body = request.body as { email?: string; name?: string; password?: string; roleIds?: string[]; ssoProvider?: string; reason?: string; hardwareKeyAssertion?: string };
    if (!body.email || !body.name || !body.password) return reply.status(400).send({ error: 'email, name, and password are required' });
    const normalizedEmail = body.email.toLowerCase().trim();
    const roleIds = body.roleIds?.length ? body.roleIds : ['EXECUTIVE'];
    const rootGrantHardwareKeyFingerprint = await requireRootGrantAuthorization(app, request, reply, roleIds, body.hardwareKeyAssertion);
    if (rootGrantHardwareKeyFingerprint === false) return;
    const roles = await app.prisma.staffRole.findMany({ where: { id: { in: roleIds } }, select: { id: true, deprecated: true } });
    const unknown = roleIds.filter((roleId) => !roles.some((role) => role.id === roleId));
    if (unknown.length > 0) return reply.status(400).send({ error: 'UNKNOWN_ROLE', message: `Unknown role(s): ${unknown.join(', ')}` });
    if (roles.some((role) => role.deprecated)) return reply.status(400).send({ error: 'ROLE_DEPRECATED', message: 'Deprecated roles cannot be assigned.' });
    if (await app.prisma.platformUser.findUnique({ where: { email: normalizedEmail }, select: { id: true } })) {
      return reply.status(409).send({ error: 'EMAIL_IN_USE', message: 'A console account with this email already exists.' });
    }

    const created = await app.prisma.$transaction(async (tx) => {
      const platformUser = await tx.platformUser.create({
        data: {
          email: normalizedEmail,
          name: body.name,
          passwordHash: await hashPassword(body.password!),
          role: roleIds.includes('ROOT') ? PlatformRole.SUPER_ADMIN : PlatformRole.PLATFORM_READONLY,
          // New staff enrol MFA themselves at first login.
          mfaEnabled: false
        }
      });
      const staff = await tx.staffUser.create({
        data: {
          platformUserId: platformUser.id,
          email: normalizedEmail,
          name: body.name!,
          ssoProvider: body.ssoProvider ?? (roleIds.includes('ROOT') ? 'root' : 'totp'),
          mfaEnabled: false
        }
      });
      await tx.staffRoleAssignment.createMany({
        data: roleIds.map((roleId) => ({ staffId: staff.id, roleId, grantedBy: request.platform!.user.id })),
        skipDuplicates: true
      });
      return tx.staffUser.findUniqueOrThrow({ where: { id: staff.id }, include: staffSelect() });
    });

    await auditIam(
      request,
      'staff.user.create',
      'staff_user',
      created.id,
      null,
      rootGrantHardwareKeyFingerprint ? { staffUser: created, rootGrantHardwareKeyFingerprint } : created,
      body.reason
    );
    reply.status(201).send(created);
  });

  app.patch('/api/internal/iam/users/:id', { preHandler: [...mutationPre, requireInternalPermission('trust.iam.write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; status?: unknown; mfaEnabled?: unknown; reason?: string };
    if (body.status !== undefined || body.mfaEnabled !== undefined) {
      return reply.status(400).send({ error: 'USE_LIFECYCLE_ACTION', message: 'Use /suspend, /offboard, /reactivate or /mfa/reset to change status or MFA.' });
    }
    const before = await app.prisma.staffUser.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'Staff user not found' });
    const after = await app.prisma.staffUser.update({ where: { id }, data: { name: body.name }, include: staffSelect() });
    if (before.platformUserId) {
      await app.prisma.platformUser.update({ where: { id: before.platformUserId }, data: { name: body.name } });
    }
    await auditIam(request, 'staff.user.update', 'staff_user', id, { name: before.name }, { name: after.name }, body.reason);
    reply.send(after);
  });

  app.post('/api/internal/iam/users/:id/suspend', { preHandler: dangerous('trust.iam.write') }, (request, reply) => changeStaffStatus(app, request, reply, 'suspend'));
  app.post('/api/internal/iam/users/:id/offboard', { preHandler: dangerous('trust.iam.write') }, (request, reply) => changeStaffStatus(app, request, reply, 'offboard'));
  app.post('/api/internal/iam/users/:id/reactivate', { preHandler: dangerous('trust.iam.write') }, (request, reply) => changeStaffStatus(app, request, reply, 'reactivate'));
  // Kept for existing clients: DELETE offboards (soft delete).
  app.delete('/api/internal/iam/users/:id', { preHandler: dangerous('trust.iam.write') }, (request, reply) => changeStaffStatus(app, request, reply, 'offboard'));

  app.get('/api/internal/iam/roles', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.iam.read')] }, async (_request, reply) => {
    const roles = await app.prisma.staffRole.findMany({ include: { _count: { select: { assignments: true } } }, orderBy: { id: 'asc' } });
    reply.send({ data: roles });
  });

  app.get('/api/internal/iam/roles/:id', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.iam.read')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const role = await app.prisma.staffRole.findUnique({ where: { id }, include: { assignments: { include: { staff: true } } } });
    if (!role) return reply.status(404).send({ error: 'Staff role not found' });
    reply.send(role);
  });

  app.post('/api/internal/iam/role-assignments', { preHandler: dangerous('trust.iam.write') }, async (request, reply) => {
    const body = request.body as { staffId?: string; roleId?: string; expiresAt?: string; reason: string; hardwareKeyAssertion?: string };
    if (!body.staffId || !body.roleId) return reply.status(400).send({ error: 'staffId and roleId are required' });
    if (body.staffId === (await callerStaffId(app, request))) {
      return reply.status(403).send({ error: 'CANNOT_TARGET_SELF', message: 'Staff cannot grant roles to themselves' });
    }
    const rootGrantHardwareKeyFingerprint = await requireRootGrantAuthorization(app, request, reply, [body.roleId], body.hardwareKeyAssertion);
    if (rootGrantHardwareKeyFingerprint === false) return;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) {
      return reply.status(400).send({ error: 'INVALID_EXPIRY', message: 'expiresAt must be a future ISO date' });
    }
    const [target, role, existing] = await Promise.all([
      app.prisma.staffUser.findUnique({ where: { id: body.staffId }, select: { id: true, status: true } }),
      app.prisma.staffRole.findUnique({ where: { id: body.roleId }, select: { id: true, deprecated: true } }),
      app.prisma.staffRoleAssignment.findUnique({ where: { staffId_roleId: { staffId: body.staffId, roleId: body.roleId } }, select: { id: true } })
    ]);
    if (!target) return reply.status(404).send({ error: 'Staff user not found' });
    if (!role) return reply.status(404).send({ error: 'Staff role not found' });
    if (role.deprecated) return reply.status(400).send({ error: 'ROLE_DEPRECATED', message: 'Deprecated roles cannot be assigned.' });
    if (target.status !== 'ACTIVE') return reply.status(409).send({ error: 'STAFF_NOT_ACTIVE', message: 'Roles can only be granted to active staff.' });
    if (existing) return reply.status(409).send({ error: 'ALREADY_ASSIGNED', message: 'This role is already assigned.' });

    const assignment = await app.prisma.staffRoleAssignment.create({
      data: { staffId: body.staffId, roleId: body.roleId, grantedBy: request.platform!.user.id, expiresAt },
      include: { role: true, staff: true }
    });
    await auditIam(
      request,
      'staff.role.assign',
      'staff_role_assignment',
      assignment.id,
      null,
      rootGrantHardwareKeyFingerprint ? { assignment, rootGrantHardwareKeyFingerprint } : assignment,
      body.reason
    );
    reply.status(201).send(assignment);
  });

  app.delete('/api/internal/iam/role-assignments/:id', { preHandler: dangerous('trust.iam.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await app.prisma.staffRoleAssignment.findUnique({ where: { id }, include: { role: true, staff: true } });
    if (!before) return reply.status(404).send({ error: 'Role assignment not found' });
    if (before.staffId === (await callerStaffId(app, request))) {
      return reply.status(403).send({ error: 'CANNOT_TARGET_SELF', message: 'Staff cannot revoke roles from themselves' });
    }
    await app.prisma.staffRoleAssignment.delete({ where: { id } });
    await auditIam(request, 'staff.role.revoke', 'staff_role_assignment', id, before, null, reasonOf(request));
    reply.status(204).send();
  });

  app.get('/api/internal/iam/permissions', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.iam.read')] }, async (_request, reply) => {
    reply.send({ data: PERMISSIONS });
  });

  // Admins can only reset another person's MFA; enrolment is self-service at login (S17).
  app.post('/api/internal/iam/users/:id/mfa/reset', { preHandler: dangerous('trust.iam.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const reason = reasonOf(request);
    const staff = await app.prisma.staffUser.findUnique({ where: { id } });
    if (!staff) return reply.status(404).send({ error: 'Staff user not found' });
    if (staff.platformUserId === request.platform!.user.id) {
      return reply.status(403).send({ error: 'CANNOT_TARGET_SELF', message: 'Ask another IAM admin to reset your MFA.' });
    }

    const now = new Date();
    await app.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({ where: { id }, data: { mfaEnabled: false } });
      if (staff.platformUserId) {
        await tx.platformUser.update({
          where: { id: staff.platformUserId },
          data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaEnrolledAt: null }
        });
        await tx.platformSession.updateMany({ where: { platformUserId: staff.platformUserId, revokedAt: null }, data: { revokedAt: now } });
      }
    });
    await auditIam(request, 'staff.mfa.reset', 'staff_user', id, { mfaEnabled: staff.mfaEnabled }, { mfaEnabled: false, sessionsRevoked: true }, reason);
    reply.send({ id, mfaEnabled: false, sessionsRevokedAt: now.toISOString() });
  });

  app.get('/api/internal/iam/role-catalog', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.iam.read')] }, async (_request, reply) => {
    reply.send({ data: STAFF_ROLE_DEFINITIONS });
  });
}
