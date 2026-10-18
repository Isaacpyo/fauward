import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../../../shared/utils/hash.js';

const auditCalls: Array<{ action: string; metadata?: unknown }> = [];

vi.mock('../../../services/platform-audit.service.js', () => ({
  writePlatformAuditLog: vi.fn(async (_db: unknown, input: { action: string; metadata?: unknown }) => {
    auditCalls.push(input);
  })
}));

vi.mock('../../../services/staff-iam.service.js', () => ({
  staffPermissionContextForPlatformUser: vi.fn(async () => ({
    staff: { id: 'staff_1', status: 'ACTIVE' },
    roles: ['PLATFORM_ENGINEER'],
    permissions: ['platform.tenants.read', 'trust.jit.request']
  }))
}));

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  role: 'SUPER_ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  mfaEnabled: boolean;
  mfaSecretEncrypted: string | null;
  mfaPendingSecretEncrypted: string | null;
  mfaEnrolledAt: Date | null;
  lastLoginAt: Date | null;
};
type SessionRow = { id: string; platformUserId: string; refreshTokenHash: string; mfaVerifiedAt: Date | null; expiresAt: Date; revokedAt: Date | null };

const PASSWORD = 'correct-horse-battery-staple';
let passwordHash = '';

function createState() {
  return {
    users: new Map<string, UserRow>(),
    sessions: new Map<string, SessionRow>(),
    staff: { id: 'staff_1', platformUserId: 'pu_1', status: 'ACTIVE', mfaEnabled: false },
    redis: new Map<string, number>()
  };
}

function createPrisma(state: ReturnType<typeof createState>) {
  let sessionSeq = 0;
  const prisma = {
    platformUser: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return state.users.get(where.id) ?? null;
        return [...state.users.values()].find((user) => user.email === where.email) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const user = state.users.get(where.id)!;
        Object.assign(user, data);
        return user;
      })
    },
    platformSession: {
      create: vi.fn(async ({ data }: { data: Omit<SessionRow, 'id' | 'revokedAt'> }) => {
        sessionSeq += 1;
        const row: SessionRow = { id: `session_${sessionSeq}`, revokedAt: null, ...data };
        state.sessions.set(row.id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.sessions.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
        const row = state.sessions.get(where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string; platformUserId?: string; revokedAt: null }; data: Partial<SessionRow> }) => {
        let count = 0;
        for (const row of state.sessions.values()) {
          if ((where.id && row.id !== where.id) || (where.platformUserId && row.platformUserId !== where.platformUserId) || row.revokedAt) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      })
    },
    staffUser: {
      findUnique: vi.fn(async () => ({ id: state.staff.id, status: state.staff.status })),
      updateMany: vi.fn(async ({ data }: { data: { mfaEnabled: boolean } }) => {
        state.staff.mfaEnabled = data.mfaEnabled;
        return { count: 1 };
      })
    },
    staffSession: { create: vi.fn(async () => ({})) },
    staffLoginAttempt: { create: vi.fn(async () => ({})) },
    jitAccessRequest: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  };
  return prisma;
}

function createRedis(state: ReturnType<typeof createState>) {
  return {
    incr: vi.fn(async (key: string) => {
      const next = (state.redis.get(key) ?? 0) + 1;
      state.redis.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
    del: vi.fn(async (key: string) => (state.redis.delete(key) ? 1 : 0))
  };
}

const openApps: FastifyInstance[] = [];

async function buildApp(state: ReturnType<typeof createState>) {
  const app = Fastify();
  openApps.push(app);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.decorate('prisma', createPrisma(state) as never);
  app.decorate('redis', createRedis(state) as never);
  const { registerConsoleAuthRoutes } = await import('./console-auth.routes.js');
  const { authenticatePlatformSession } = await import('../../../middleware/authenticate-platform-session.js');
  await registerConsoleAuthRoutes(app);
  // Stand-in for any non-allowlisted console route.
  app.get('/api/internal/tenants', { preHandler: [authenticatePlatformSession] }, async (_request: FastifyRequest, reply: FastifyReply) => reply.send({ data: [] }));
  return app;
}

function addUser(state: ReturnType<typeof createState>, overrides: Partial<UserRow> = {}) {
  const user: UserRow = {
    id: 'pu_1',
    email: 'ops@fauward.com',
    name: 'Ops',
    passwordHash,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    mfaEnabled: false,
    mfaSecretEncrypted: null,
    mfaPendingSecretEncrypted: null,
    mfaEnrolledAt: null,
    lastLoginAt: null,
    ...overrides
  };
  state.users.set(user.id, user);
  return user;
}

class CookieJar {
  private jar = new Map<string, string>();
  absorb(response: { cookies: Array<{ name: string; value: string }> }) {
    for (const c of response.cookies) {
      if (c.value === '') this.jar.delete(c.name);
      else this.jar.set(c.name, c.value);
    }
  }
  get(name: string) {
    return this.jar.get(name);
  }
  headers(mutating = false) {
    const headers: Record<string, string> = { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    if (mutating) headers['x-csrf-token'] = this.jar.get('fw_platform_csrf') ?? '';
    return headers;
  }
}

async function login(app: FastifyInstance, jar: CookieJar, prefix = '/api/internal/auth') {
  const response = await app.inject({ method: 'POST', url: `${prefix}/login`, payload: { email: 'ops@fauward.com', password: PASSWORD } });
  jar.absorb(response);
  return response;
}

function setKeyring() {
  process.env.FIELD_ENCRYPTION_KEYS = JSON.stringify({ k1: randomBytes(32).toString('base64') });
  process.env.FIELD_ENCRYPTION_ACTIVE_KEY_ID = 'k1';
}

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  auditCalls.length = 0;
  setKeyring();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
  delete process.env.FIELD_ENCRYPTION_KEYS;
  delete process.env.FIELD_ENCRYPTION_ACTIVE_KEY_ID;
});

describe('console auth — WP-0.1', () => {
  it('ACC-AUTH-1 login returns ENROLL for an unenrolled user and every non-allowlisted call is MFA_PENDING', async () => {
    const state = createState();
    addUser(state);
    const app = await buildApp(state);
    const jar = new CookieJar();

    for (const prefix of ['/api/internal/auth', '/api/v1/platform/auth']) {
      const response = await login(app, jar, prefix);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ mfa: 'ENROLL', user: { email: 'ops@fauward.com' } });
    }
    expect([...state.sessions.values()].every((session) => session.mfaVerifiedAt === null)).toBe(true);

    const blocked = await app.inject({ method: 'GET', url: '/api/internal/tenants', headers: jar.headers() });
    expect(blocked.statusCode).toBe(401);
    expect(blocked.json()).toEqual({ error: 'MFA_PENDING', mfa: 'ENROLL' });

    const me = await app.inject({ method: 'GET', url: '/api/internal/auth/me', headers: jar.headers() });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ mfa: { enabled: false, pending: true, verifiedAt: null } });
  });

  it('ACC-AUTH-1 login returns VERIFY for an enrolled user', async () => {
    const state = createState();
    addUser(state, { mfaEnabled: true, mfaSecretEncrypted: 'JBSWY3DPEHPK3PXP' });
    const app = await buildApp(state);
    const response = await login(app, new CookieJar());
    expect(response.json()).toMatchObject({ mfa: 'VERIFY' });
  });

  it('ACC-AUTH-2 enrol start → confirm stores v1 ciphertext, sets mfaVerifiedAt and re-issues a token with permissions', async () => {
    const state = createState();
    addUser(state);
    const app = await buildApp(state);
    const jar = new CookieJar();
    await login(app, jar);

    const start = await app.inject({ method: 'POST', url: '/api/internal/auth/mfa/enroll/start', headers: jar.headers(true) });
    expect(start.statusCode).toBe(200);
    const { otpauth, qrCode } = start.json() as { otpauth: string; qrCode: string };
    expect(qrCode).toMatch(/^data:image\/png;base64,/);
    const pending = state.users.get('pu_1')!.mfaPendingSecretEncrypted!;
    expect(pending.startsWith('v1:k1:')).toBe(true);
    const secret = new URL(otpauth).searchParams.get('secret')!;
    expect(pending).not.toContain(secret);

    const confirm = await app.inject({
      method: 'POST',
      url: '/api/internal/auth/mfa/enroll/confirm',
      headers: jar.headers(true),
      payload: { code: authenticator.generate(secret) }
    });
    expect(confirm.statusCode).toBe(200);
    jar.absorb(confirm);

    const user = state.users.get('pu_1')!;
    expect(user.mfaEnabled).toBe(true);
    expect(user.mfaSecretEncrypted?.startsWith('v1:k1:')).toBe(true);
    expect(user.mfaPendingSecretEncrypted).toBeNull();
    expect(user.mfaEnrolledAt).toBeInstanceOf(Date);
    expect(state.staff.mfaEnabled).toBe(true);
    expect([...state.sessions.values()][0].mfaVerifiedAt).toBeInstanceOf(Date);
    expect(auditCalls.map((call) => call.action)).toContain('PLATFORM_MFA_ENROLLED');

    const claims = jwt.decode(jar.get('fw_platform_access')!) as { permissions: string[]; mfaVerifiedAt: string | null };
    expect(claims.permissions).toEqual(['platform.tenants.read', 'trust.jit.request']);
    expect(claims.mfaVerifiedAt).not.toBeNull();

    const allowed = await app.inject({ method: 'GET', url: '/api/internal/tenants', headers: jar.headers() });
    expect(allowed.statusCode).toBe(200);
  });

  it('ACC-AUTH-2 verify decrypts the stored secret and re-issues the token with permissions (C3)', async () => {
    const state = createState();
    const secret = authenticator.generateSecret();
    const { encryptField } = await import('../../../services/crypto/field-encryption.js');
    addUser(state, { mfaEnabled: true, mfaSecretEncrypted: encryptField(secret) });
    const app = await buildApp(state);
    const jar = new CookieJar();
    await login(app, jar);

    const verify = await app.inject({ method: 'POST', url: '/api/internal/auth/mfa/verify', headers: jar.headers(true), payload: { code: authenticator.generate(secret) } });
    expect(verify.statusCode).toBe(200);
    jar.absorb(verify);
    const claims = jwt.decode(jar.get('fw_platform_access')!) as { permissions: string[] };
    expect(claims.permissions).toContain('platform.tenants.read');
  });

  it('ACC-AUTH-3 five wrong codes hit the rate limit', async () => {
    const state = createState();
    addUser(state, { mfaEnabled: true, mfaSecretEncrypted: authenticator.generateSecret() });
    const app = await buildApp(state);
    const jar = new CookieJar();
    await login(app, jar);

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await app.inject({ method: 'POST', url: '/api/internal/auth/mfa/verify', headers: jar.headers(true), payload: { code: '000000' } });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
  });

  it('ACC-AUTH-3 the tenth failure within 15 minutes revokes the session', async () => {
    const state = createState();
    addUser(state, { mfaEnabled: true, mfaSecretEncrypted: authenticator.generateSecret() });
    const app = await buildApp(state);
    const jar = new CookieJar();
    await login(app, jar);
    const sessionId = [...state.sessions.keys()][0];
    state.redis.set(`platform:mfa-failures:${sessionId}`, 9);

    const response = await app.inject({ method: 'POST', url: '/api/internal/auth/mfa/verify', headers: jar.headers(true), payload: { code: '000000' } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'MFA_LOCKED' });
    expect(state.sessions.get(sessionId)!.revokedAt).toBeInstanceOf(Date);
    expect(auditCalls).toContainEqual(expect.objectContaining({ action: 'PLATFORM_SESSION_REVOKED', metadata: expect.objectContaining({ reason: 'mfa_failures' }) }));
  });
});

describe('fresh MFA guard — WP-0.1', () => {
  function makeReply() {
    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    return { status, send };
  }

  it('ACC-AUTH-4 a session verified 11 minutes ago gets 403 MFA_REQUIRED with stepUp', async () => {
    const { requireFreshMfa } = await import('../../../middleware/require-fresh-platform-mfa.js');
    const reply = makeReply();
    const request = { platform: { user: { mfaEnabled: true }, session: { mfaVerifiedAt: new Date(Date.now() - 11 * 60 * 1000) } } };
    await requireFreshMfa(request as unknown as FastifyRequest, reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'MFA_REQUIRED', stepUp: true }));
  });

  it('ACC-AUTH-4 an unenrolled user gets 403 MFA_ENROLLMENT_REQUIRED', async () => {
    const { requireFreshMfa } = await import('../../../middleware/require-fresh-platform-mfa.js');
    const reply = makeReply();
    const request = { platform: { user: { mfaEnabled: false }, session: { mfaVerifiedAt: new Date() } } };
    await requireFreshMfa(request as unknown as FastifyRequest, reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'MFA_ENROLLMENT_REQUIRED' }));
  });

  it('ACC-AUTH-4 a session verified 2 minutes ago passes', async () => {
    const { requireFreshMfa } = await import('../../../middleware/require-fresh-platform-mfa.js');
    const reply = makeReply();
    const request = { platform: { user: { mfaEnabled: true }, session: { mfaVerifiedAt: new Date(Date.now() - 2 * 60 * 1000) } } };
    await requireFreshMfa(request as unknown as FastifyRequest, reply as unknown as FastifyReply);
    expect(reply.status).not.toHaveBeenCalled();
  });
});

describe('TOTP backfill — WP-0.1', () => {
  it('ACC-AUTH-5 encrypts plaintext secrets and a second run changes nothing', async () => {
    const { encryptTotpSecrets } = await import('../../../scripts/backfills/encrypt-totp-secrets.js');
    const { decryptField } = await import('../../../services/crypto/field-encryption.js');
    const rows = [
      { id: 'a', mfaSecretEncrypted: 'JBSWY3DPEHPK3PXP', mfaPendingSecretEncrypted: null as string | null },
      { id: 'b', mfaSecretEncrypted: null as string | null, mfaPendingSecretEncrypted: 'KRSXG5CTMVRXEZLU' }
    ];
    const db = {
      platformUser: {
        findMany: vi.fn(async () => rows.map((row) => ({ ...row }))),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { mfaSecretEncrypted?: string; mfaPendingSecretEncrypted?: string } }) => {
          Object.assign(rows.find((row) => row.id === where.id)!, data);
          return {};
        })
      }
    };

    const dry = await encryptTotpSecrets(db, { dryRun: true });
    expect(dry).toEqual({ scanned: 2, alreadyEncrypted: 0, encrypted: 2, dryRun: true });
    expect(db.platformUser.update).not.toHaveBeenCalled();

    const first = await encryptTotpSecrets(db, { dryRun: false });
    expect(first.encrypted).toBe(2);
    expect(decryptField(rows[0].mfaSecretEncrypted!)).toBe('JBSWY3DPEHPK3PXP');
    expect(decryptField(rows[1].mfaPendingSecretEncrypted!)).toBe('KRSXG5CTMVRXEZLU');
    const snapshot = JSON.stringify(rows);

    const second = await encryptTotpSecrets(db, { dryRun: false });
    expect(second).toEqual({ scanned: 2, alreadyEncrypted: 2, encrypted: 0, dryRun: false });
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
