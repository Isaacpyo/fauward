import { randomBytes } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@prisma/client';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { hashPassword, verifyPassword } from '../../shared/utils/hash.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function roleFromString(value?: string): UserRole | null {
  if (!value) return null;
  if ((Object.values(UserRole) as string[]).includes(value)) {
    return value as UserRole;
  }
  return null;
}

export async function registerUsersRoutes(app: FastifyInstance) {
  app.get('/api/v1/users/me', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const userId = request.user?.sub;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const user = await app.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        mfaEnabled: true,
        createdAt: true,
        lastLogin: true,
        isActive: true
      }
    });

    if (!user) return reply.status(404).send({ error: 'User not found' });
    reply.send({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(' '),
      phone: user.phone,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    });
  });

  app.patch('/api/v1/users/me', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const userId = request.user?.sub;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const payload = request.body as {
      firstName?: string;
      lastName?: string;
      phone?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const user = await app.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    if (payload.newPassword) {
      if (!payload.currentPassword) {
        return reply.status(400).send({ error: 'currentPassword is required' });
      }
      if (!user.passwordHash) {
        return reply.status(400).send({ error: 'Password login is not enabled for this account' });
      }
      const ok = await verifyPassword(payload.currentPassword, user.passwordHash);
      if (!ok) {
        return reply.status(400).send({ error: 'Current password is incorrect' });
      }
    }

    const updated = await app.prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        passwordHash: payload.newPassword ? await hashPassword(payload.newPassword) : undefined
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        mfaEnabled: true,
        isActive: true
      }
    });

    reply.send(updated);
  });

  app.get(
    '/api/v1/users',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER', 'SUPER_ADMIN'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const users = await app.prisma.user.findMany({
        where: { tenantId },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          isActive: true,
          createdAt: true,
          lastLogin: true
        },
        orderBy: { createdAt: 'desc' }
      });

      reply.send({
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        }))
      });
    }
  );

  app.post(
    '/api/v1/users/invite',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;
      const actorId = request.user?.sub;
      if (!actorId) return reply.status(401).send({ error: 'Unauthorized' });

      const payload = request.body as {
        email?: string;
        role?: string;
        firstName?: string;
        lastName?: string;
      };

      if (!payload.email) return reply.status(400).send({ error: 'email is required' });
      const email = payload.email.toLowerCase();
      const role = roleFromString(payload.role ?? 'TENANT_STAFF');
      if (!role || role === 'SUPER_ADMIN') {
        return reply.status(400).send({ error: 'Invalid role' });
      }

      const existing = await app.prisma.user.findFirst({ where: { tenantId, email } });
      if (existing) {
        return reply.status(409).send({ error: 'User with this email already exists' });
      }

      const temporaryPassword = randomBytes(12).toString('base64url');
      const user = await app.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            tenantId,
            email,
            role,
            firstName: payload.firstName,
            lastName: payload.lastName,
            passwordHash: await hashPassword(temporaryPassword),
            invitedBy: actorId,
            isActive: true
          }
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            actorId,
            action: 'USER_INVITE',
            resourceType: 'USER',
            resourceId: created.id,
            metadata: {
              role,
              invitedEmail: created.email
            }
          }
        });

        await tx.notificationLog.create({
          data: {
            tenantId,
            userId: created.id,
            channel: 'EMAIL',
            event: 'staff_invite',
            status: 'QUEUED'
          }
        });

        return created;
      });

      reply.status(201).send({
        id: user.id,
        email: user.email,
        role: user.role,
        temporaryPassword
      });
    }
  );

  app.patch(
    '/api/v1/users/:id/role',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;
      const actorId = request.user?.sub;
      if (!actorId) return reply.status(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const { role } = request.body as { role?: string };
      const nextRole = roleFromString(role);
      if (!nextRole || nextRole === 'SUPER_ADMIN') {
        return reply.status(400).send({ error: 'Invalid role' });
      }

      if (id === actorId && nextRole !== 'TENANT_ADMIN') {
        return reply.status(400).send({ error: 'You cannot demote yourself' });
      }

      const target = await app.prisma.user.findFirst({ where: { id, tenantId } });
      if (!target) return reply.status(404).send({ error: 'User not found' });

      const updated = await app.prisma.$transaction(async (tx) => {
        const result = await tx.user.update({
          where: { id: target.id },
          data: { role: nextRole }
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            actorId,
            action: 'USER_ROLE_UPDATE',
            resourceType: 'USER',
            resourceId: target.id,
            metadata: {
              previousRole: target.role,
              nextRole
            }
          }
        });

        return result;
      });

      reply.send(updated);
    }
  );

  app.delete(
    '/api/v1/users/:id',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;
      const actorId = request.user?.sub;
      if (!actorId) return reply.status(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      if (id === actorId) return reply.status(400).send({ error: 'You cannot delete yourself' });

      const target = await app.prisma.user.findFirst({ where: { id, tenantId } });
      if (!target) return reply.status(404).send({ error: 'User not found' });

      await app.prisma.$transaction([
        app.prisma.user.update({ where: { id: target.id }, data: { isActive: false } }),
        app.prisma.auditLog.create({
          data: {
            tenantId,
            actorId,
            action: 'USER_DEACTIVATE',
            resourceType: 'USER',
            resourceId: target.id
          }
        })
      ]);

      reply.status(204).send();
    }
  );

  app.patch(
    '/api/v1/users/:id/suspend',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'SUPER_ADMIN'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const actorId = request.user?.sub;
      const { id } = request.params as { id: string };
      if (!actorId) return reply.status(401).send({ error: 'Unauthorized' });
      if (id === actorId) return reply.status(400).send({ error: 'You cannot suspend your own account' });

      const target = await app.prisma.user.findFirst({
        where: { id, tenantId },
        select: { id: true, role: true }
      });
      if (!target) return reply.status(404).send({ error: 'User not found' });

      if (target.role === 'TENANT_ADMIN' && request.user?.role !== 'SUPER_ADMIN') {
        return reply.status(403).send({ error: 'Only SUPER_ADMIN can suspend another TENANT_ADMIN' });
      }

      await app.prisma.$transaction([
        app.prisma.user.update({ where: { id: target.id }, data: { isActive: false } }),
        app.prisma.auditLog.create({
          data: {
            tenantId,
            actorId,
            action: 'USER_SUSPEND',
            resourceType: 'USER',
            resourceId: target.id,
            metadata: { role: target.role }
          }
        })
      ]);

      reply.send({ success: true });
    }
  );

  app.patch(
    '/api/v1/users/:id/activate',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'SUPER_ADMIN'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const actorId = request.user?.sub;
      const { id } = request.params as { id: string };
      if (!actorId) return reply.status(401).send({ error: 'Unauthorized' });

      const target = await app.prisma.user.findFirst({
        where: { id, tenantId },
        select: { id: true, role: true }
      });
      if (!target) return reply.status(404).send({ error: 'User not found' });

      await app.prisma.$transaction([
        app.prisma.user.update({ where: { id: target.id }, data: { isActive: true } }),
        app.prisma.auditLog.create({
          data: {
            tenantId,
            actorId,
            action: 'USER_ACTIVATE',
            resourceType: 'USER',
            resourceId: target.id,
            metadata: { role: target.role }
          }
        })
      ]);

      reply.send({ success: true });
    }
  );
}
