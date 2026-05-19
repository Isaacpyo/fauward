import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

let currentPermissions: Permission[] = [];
const writeAuditMock = vi.fn(async () => undefined);
const openApps: Array<{ close: () => Promise<void> }> = [];

vi.mock('@fauward/internal-audit', () => ({
  writeAudit: writeAuditMock
}));

vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: 'staff_001', email: 'security@fauward.com', role: 'SUPER_ADMIN' },
      session: { id: 'platform_session_001' }
    };
  }
}));

vi.mock('../../middleware/require-platform-csrf.js', () => ({
  requirePlatformCsrf: async () => undefined
}));

vi.mock('../../middleware/require-internal-permission.js', () => ({
  requireInternalPermission: (permission: Permission) => async (_request: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    if (!currentPermissions.includes(permission)) return reply.status(403).send({ error: 'Forbidden', permission });
    return undefined;
  }
}));

vi.mock('../../services/staff-iam.service.js', () => ({
  STAFF_ROLE_DEFINITIONS: [],
  seedStaffRoles: vi.fn(async () => undefined),
  staffPermissionContextForPlatformUser: async () => ({ permissions: currentPermissions })
}));

function createPrisma() {
  return {
    staffRoleAssignment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'assignment_001', ...data, role: { id: data.roleId }, staff: { id: data.staffId } }))
    }
  };
}

async function buildApp(prisma = createPrisma()) {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', prisma as never);
  const { registerInternalIamRoutes } = await import('../../modules/internal/iam.routes.js');
  await registerInternalIamRoutes(app);
  return { app, prisma };
}

describe('internal IAM ROOT grants', () => {
  beforeEach(() => {
    currentPermissions = ['trust.iam.write', 'trust.iam.root'];
    process.env.DEV_HARDWARE_KEY_ASSERTION = 'valid-hardware-assertion';
  });

  afterEach(async () => {
    await Promise.all(openApps.splice(0).map((app) => app.close()));
    vi.clearAllMocks();
    delete process.env.DEV_HARDWARE_KEY_ASSERTION;
  });

  it('rejects persistent ROOT role assignments without a hardware assertion', async () => {
    const { app, prisma } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/iam/role-assignments',
      payload: { staffId: 'staff_002', roleId: 'ROOT', reason: 'emergency access' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'ROOT grant requires hardware key verification' });
    expect(prisma.staffRoleAssignment.create).not.toHaveBeenCalled();
  });

  it('records a hardware-key fingerprint when granting persistent ROOT', async () => {
    const { app, prisma } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/iam/role-assignments',
      payload: {
        staffId: 'staff_002',
        roleId: 'ROOT',
        hardwareKeyAssertion: 'valid-hardware-assertion',
        reason: 'break-glass rotation'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(prisma.staffRoleAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ staffId: 'staff_002', roleId: 'ROOT', grantedBy: 'staff_001' })
    }));
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'staff.role.assign',
      after: expect.objectContaining({
        assignment: expect.objectContaining({ roleId: 'ROOT' }),
        rootGrantHardwareKeyFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    }));
    expect(JSON.stringify(writeAuditMock.mock.calls)).not.toContain('valid-hardware-assertion');
  });

  it('rejects ROOT user creation without a hardware assertion before creating records', async () => {
    const prisma = {
      ...createPrisma(),
      $transaction: vi.fn()
    };
    const { app } = await buildApp(prisma);

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/iam/users',
      payload: {
        email: 'root-grantee@fauward.com',
        name: 'Root Grantee',
        password: 'correct-horse-battery-staple',
        roleIds: ['ROOT'],
        reason: 'break-glass bootstrap'
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'ROOT grant requires hardware key verification' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
