import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

let currentPermissions: Permission[] = [];
let mfaVerifiedAt: Date | null = new Date();
const writeAuditMock = vi.fn(async () => undefined);
const openApps: FastifyInstance[] = [];

vi.mock('@fauward/internal-audit', () => ({
  writeAudit: writeAuditMock
}));

vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: 'pu_self', email: 'security@fauward.com', role: 'SUPER_ADMIN', mfaEnabled: true },
      session: { id: 'platform_session_001', mfaVerifiedAt }
    };
  }
}));

vi.mock('../../middleware/require-platform-csrf.js', () => ({
  requirePlatformCsrf: async () => undefined
}));

vi.mock('../../middleware/require-console-permission.js', () => {
  type ReplyLike = { status: (code: number) => { send: (body: unknown) => unknown } };
  return {
    requireConsolePermission: (permission: Permission) => async (_request: unknown, reply: ReplyLike) => {
      if (!currentPermissions.includes(permission)) return reply.status(403).send({ error: 'Forbidden', permission });
      return undefined;
    },
    requireAnyConsolePermission: (permissions: Permission[]) => async (_request: unknown, reply: ReplyLike) => {
      if (!permissions.some((permission) => currentPermissions.includes(permission))) return reply.status(403).send({ error: 'Forbidden', permission: permissions[0] });
      return undefined;
    },
    consoleUserHas: async (_request: unknown, permission: Permission) => currentPermissions.includes(permission),
    loadConsoleContext: async () => ({ permissions: currentPermissions, jit: new Map() })
  };
});

vi.mock('../../services/staff-iam.service.js', () => ({
  STAFF_ROLE_DEFINITIONS: [],
  seedStaffRoles: vi.fn(async () => undefined),
  staffPermissionContextForPlatformUser: async () => ({ permissions: currentPermissions })
}));

type StaffRow = { id: string; platformUserId: string | null; email: string; name: string; status: 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED'; mfaEnabled: boolean };

function createPrisma() {
  const staff = new Map<string, StaffRow>([
    ['staff_self', { id: 'staff_self', platformUserId: 'pu_self', email: 'security@fauward.com', name: 'Self', status: 'ACTIVE', mfaEnabled: true }],
    ['staff_002', { id: 'staff_002', platformUserId: 'pu_002', email: 'ops@fauward.com', name: 'Ops', status: 'ACTIVE', mfaEnabled: true }]
  ]);
  const prisma = {
    staff,
    staffUser: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; platformUserId?: string } }) => {
        if (where.id) return staff.get(where.id) ?? null;
        return [...staff.values()].find((row) => row.platformUserId === where.platformUserId) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StaffRow> }) => Object.assign(staff.get(where.id)!, data))
    },
    staffRole: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (['ROOT', 'EXECUTIVE', 'SUPPORT_LEAD'].includes(where.id) ? { id: where.id, deprecated: false } : where.id === 'SUPER_ADMIN' ? { id: 'SUPER_ADMIN', deprecated: true } : null))
    },
    staffRoleAssignment: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) => (where.id === 'assignment_self' ? { id: 'assignment_self', staffId: 'staff_self', roleId: 'EXECUTIVE', role: {}, staff: {} } : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'assignment_001', ...data, role: { id: data.roleId }, staff: { id: data.staffId } })),
      delete: vi.fn(async () => ({}))
    },
    platformUser: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data)
    },
    platformSession: { updateMany: vi.fn(async () => ({ count: 2 })) },
    staffSession: { updateMany: vi.fn(async () => ({ count: 2 })) },
    platformActivity: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: `activity_${String(create.type)}`, ...create }))
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma))
  };
  return prisma;
}

async function buildApp(prisma = createPrisma()) {
  const app = Fastify();
  openApps.push(app);
  const routes: RouteOptions[] = [];
  app.addHook('onRoute', (route) => {
    routes.push(route);
  });
  app.decorate('prisma', prisma as never);
  const { registerInternalIamRoutes } = await import('../../modules/internal/iam.routes.js');
  await registerInternalIamRoutes(app);
  await app.ready();
  return { app, prisma, routes };
}

beforeEach(() => {
  currentPermissions = ['trust.iam.read', 'trust.iam.write', 'trust.iam.root'];
  mfaVerifiedAt = new Date();
  process.env.DEV_HARDWARE_KEY_ASSERTION = 'valid-hardware-assertion';
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
  vi.clearAllMocks();
  delete process.env.DEV_HARDWARE_KEY_ASSERTION;
});

describe('IAM ROOT grants (S2)', () => {
  it('ACC-IAM-1 with DEV_HARDWARE_KEY_ASSERTION unset, granting ROOT returns 503 and the old literal does not work', async () => {
    delete process.env.DEV_HARDWARE_KEY_ASSERTION;
    const { app, prisma } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/iam/role-assignments',
      payload: { staffId: 'staff_002', roleId: 'ROOT', hardwareKeyAssertion: 'dev-hardware-key', reason: 'emergency access' }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'ROOT_GRANT_UNAVAILABLE' });
    expect(prisma.staffRoleAssignment.create).not.toHaveBeenCalled();
  });

  it('ACC-IAM-1 ROOT JIT and the shared check never fall back to a literal assertion', async () => {
    const { checkRootHardwareAssertion } = await import('../../services/root-grant.service.js');
    expect(checkRootHardwareAssertion('dev-hardware-key', {})).toMatchObject({ ok: false, status: 503, error: 'ROOT_GRANT_UNAVAILABLE' });
    expect(checkRootHardwareAssertion('wrong', { DEV_HARDWARE_KEY_ASSERTION: 'right' })).toMatchObject({ ok: false, status: 403 });
    expect(checkRootHardwareAssertion('right', { DEV_HARDWARE_KEY_ASSERTION: 'right' })).toMatchObject({ ok: true });

    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const file of ['../../modules/internal/iam.routes.ts', '../../modules/internal/console-phases.routes.ts']) {
      expect(fs.readFileSync(path.resolve(here, file), 'utf8')).not.toContain("'dev-hardware-key'");
    }
  });

  it('rejects ROOT role assignments without a hardware assertion', async () => {
    const { app, prisma } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/iam/role-assignments',
      payload: { staffId: 'staff_002', roleId: 'ROOT', reason: 'emergency access' }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'HARDWARE_KEY_REQUIRED' });
    expect(prisma.staffRoleAssignment.create).not.toHaveBeenCalled();
  });

  it('records a hardware-key fingerprint when granting persistent ROOT', async () => {
    const { app, prisma } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/iam/role-assignments',
      payload: { staffId: 'staff_002', roleId: 'ROOT', hardwareKeyAssertion: 'valid-hardware-assertion', reason: 'break-glass rotation' }
    });

    expect(response.statusCode).toBe(201);
    expect(prisma.staffRoleAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ staffId: 'staff_002', roleId: 'ROOT', grantedBy: 'pu_self' })
    }));
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'staff.role.assign',
      after: expect.objectContaining({ rootGrantHardwareKeyFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) })
    }));
    expect(JSON.stringify(writeAuditMock.mock.calls)).not.toContain('valid-hardware-assertion');
  });

  it('rejects ROOT user creation without a hardware assertion before creating records', async () => {
    const { app, prisma } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/iam/users',
      payload: { email: 'root-grantee@fauward.com', name: 'Root Grantee', password: 'correct-horse-battery-staple', roleIds: ['ROOT'], reason: 'break-glass bootstrap' }
    });
    expect(response.statusCode).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('the deprecated ROOT-equivalent SUPER_ADMIN role cannot be assigned', async () => {
    const { app, prisma } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/iam/role-assignments',
      payload: { staffId: 'staff_002', roleId: 'SUPER_ADMIN', hardwareKeyAssertion: 'valid-hardware-assertion', reason: 'legacy grant attempt' }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'ROLE_DEPRECATED' });
    expect(prisma.staffRoleAssignment.create).not.toHaveBeenCalled();
  });
});

describe('IAM self-grant (S3)', () => {
  it("ACC-IAM-2 granting a role to the caller's own StaffUser id returns 403", async () => {
    const { app, prisma } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/iam/role-assignments',
      payload: { staffId: 'staff_self', roleId: 'SUPPORT_LEAD', reason: 'self escalation attempt' }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'CANNOT_TARGET_SELF' });
    expect(prisma.staffRoleAssignment.create).not.toHaveBeenCalled();
  });

  it('ACC-IAM-2 revoking a role from the caller returns 403', async () => {
    const { app, prisma } = await buildApp();
    const response = await app.inject({ method: 'DELETE', url: '/api/internal/iam/role-assignments/assignment_self', payload: { reason: 'self revoke attempt' } });
    expect(response.statusCode).toBe(403);
    expect(prisma.staffRoleAssignment.delete).not.toHaveBeenCalled();
  });
});

describe('IAM staff lifecycle (S4)', () => {
  it('ACC-IAM-3 suspending a staff user disables the platform user and revokes every session in one transaction', async () => {
    const { app, prisma } = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/internal/iam/users/staff_002/suspend', payload: { reason: 'Laptop reported stolen' } });

    expect(response.statusCode).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.platformUser.update).toHaveBeenCalledWith({ where: { id: 'pu_002' }, data: expect.objectContaining({ status: 'DISABLED' }) });
    expect(prisma.platformSession.updateMany).toHaveBeenCalledWith({ where: { platformUserId: 'pu_002', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(prisma.staffSession.updateMany).toHaveBeenCalledWith({ where: { staffId: 'staff_002', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(prisma.staff.get('staff_002')!.status).toBe('SUSPENDED');
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'staff.user.suspend', reason: 'Laptop reported stolen' }));
  });

  it('WP-1.0 every IAM mutation records exactly one PlatformActivity row (suspend in the same transaction)', async () => {
    const { app, prisma } = await buildApp();
    const assign = await app.inject({ method: 'POST', url: '/api/internal/iam/role-assignments', payload: { staffId: 'staff_002', roleId: 'EXECUTIVE', reason: 'Quarterly access review' } });
    expect(assign.statusCode).toBe(201);
    expect(prisma.platformActivity.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.platformActivity.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ create: expect.objectContaining({ type: 'staff.role.assign' }) }));

    const suspend = await app.inject({ method: 'POST', url: '/api/internal/iam/users/staff_002/suspend', payload: { reason: 'Laptop reported stolen' } });
    expect(suspend.statusCode).toBe(200);
    expect(prisma.platformActivity.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.platformActivity.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ service: 'trust.iam', type: 'staff.user.suspend', actorType: 'STAFF', actorId: 'pu_self', subjectId: 'staff_002', consoleLink: '/trust/iam/users/staff_002' })
      })
    );
  });

  it('offboarding is final: reactivating an offboarded user returns 409', async () => {
    const prisma = createPrisma();
    prisma.staff.get('staff_002')!.status = 'OFFBOARDED';
    const { app } = await buildApp(prisma);
    const response = await app.inject({ method: 'POST', url: '/api/internal/iam/users/staff_002/reactivate', payload: { reason: 'Returned from leave' } });
    expect(response.statusCode).toBe(409);
  });

  it('PATCH cannot change status or MFA directly', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'PATCH', url: '/api/internal/iam/users/staff_002', payload: { status: 'ACTIVE' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'USE_LIFECYCLE_ACTION' });
  });
});

describe('IAM dangerous actions (architecture §9.2)', () => {
  it('ACC-IAM-6 role assignment without a reason returns 400 REASON_REQUIRED', async () => {
    const { app, prisma } = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/internal/iam/role-assignments', payload: { staffId: 'staff_002', roleId: 'SUPPORT_LEAD' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'REASON_REQUIRED' });
    expect(prisma.staffRoleAssignment.create).not.toHaveBeenCalled();
  });

  it('ACC-IAM-6 role assignment with stale MFA returns 403 MFA_REQUIRED', async () => {
    mfaVerifiedAt = new Date(Date.now() - 11 * 60 * 1000);
    const { app } = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/internal/iam/role-assignments', payload: { staffId: 'staff_002', roleId: 'SUPPORT_LEAD', reason: 'Covering support rota' } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'MFA_REQUIRED', stepUp: true });
  });

  it('ACC-IAM-6 role assignment without trust.iam.write returns 403 with the permission', async () => {
    currentPermissions = ['trust.iam.read'];
    const { app } = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/internal/iam/role-assignments', payload: { staffId: 'staff_002', roleId: 'SUPPORT_LEAD', reason: 'Covering support rota' } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ permission: 'trust.iam.write' });
  });

  it('every route in DANGEROUS_ROUTES is registered with fresh MFA and a reason guard', async () => {
    const { routes } = await buildApp();
    const { DANGEROUS_ROUTES } = await import('../../modules/internal/dangerous-routes.js');
    const { requireFreshMfa } = await import('../../middleware/require-fresh-platform-mfa.js');
    for (const expected of DANGEROUS_ROUTES.filter((route) => route.url.startsWith('/api/internal/iam/'))) {
      const route = routes.find((item) => item.url === expected.url && [item.method].flat().includes(expected.method));
      expect(route, `${expected.method} ${expected.url} registered`).toBeDefined();
      const handlers = [route!.preHandler].flat();
      expect(handlers, `${expected.method} ${expected.url} fresh MFA`).toContain(requireFreshMfa);
      expect(handlers.some((handler) => typeof handler === 'function' && 'reasonGuard' in handler), `${expected.method} ${expected.url} reason`).toBe(true);
    }
  });
});

describe('IAM removed routes', () => {
  it('ACC-IAM-7 the Google SSO "callback" upsert route is gone (404)', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/internal/iam/sso/google/callback', payload: { email: 'x@fauward.com', name: 'X' } });
    expect(response.statusCode).toBe(404);
  });

  it("ACC-IAM-9 admin TOTP enrolment is gone (404) and MFA reset never returns a secret", async () => {
    const { app, prisma } = await buildApp();
    const enrol = await app.inject({ method: 'POST', url: '/api/internal/iam/users/staff_002/totp-enrollment', payload: {} });
    expect(enrol.statusCode).toBe(404);

    const reset = await app.inject({ method: 'POST', url: '/api/internal/iam/users/staff_002/mfa/reset', payload: { reason: 'Lost phone, verified by video call' } });
    expect(reset.statusCode).toBe(200);
    expect(Object.keys(reset.json()).sort()).toEqual(['id', 'mfaEnabled', 'sessionsRevokedAt']);
    expect(reset.body).not.toMatch(/secret|otpauth|qrCode/i);
    expect(prisma.platformUser.update).toHaveBeenCalledWith({ where: { id: 'pu_002' }, data: expect.objectContaining({ mfaEnabled: false, mfaSecretEncrypted: null }) });
  });

  it('MFA reset cannot target the caller', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/internal/iam/users/staff_self/mfa/reset', payload: { reason: 'Resetting my own device' } });
    expect(response.statusCode).toBe(403);
  });
});
