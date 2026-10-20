import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const openApps: FastifyInstance[] = [];

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { headers: Record<string, unknown>; platform?: unknown }) => {
    const id = String(request.headers['x-test-user'] ?? 'pu_alice');
    request.platform = { user: { id, email: `${id}@fauward.com`, role: 'PLATFORM_READONLY' }, session: { id: `session_${id}` } };
  }
}));

vi.mock('../../../middleware/require-platform-csrf.js', () => ({
  requirePlatformCsrf: async () => undefined
}));

type Row = { id: string; platformUserId: string; event: string; title: string; readAt: Date | null; createdAt: Date };

function matches(row: Row, where: { id?: string; platformUserId?: string; readAt?: null }) {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.platformUserId !== undefined && row.platformUserId !== where.platformUserId) return false;
  if (where.readAt === null && row.readAt !== null) return false;
  return true;
}

function createPrisma() {
  const rows: Row[] = [
    { id: '00000000-0000-4000-8000-000000000001', platformUserId: 'pu_alice', event: 'jit.requested', title: 'JIT request', readAt: null, createdAt: new Date('2026-10-18T10:00:00Z') },
    { id: '00000000-0000-4000-8000-000000000002', platformUserId: 'pu_alice', event: 'appeal.created', title: 'Appeal', readAt: null, createdAt: new Date('2026-10-18T11:00:00Z') },
    { id: '00000000-0000-4000-8000-000000000003', platformUserId: 'pu_bob', event: 'jit.requested', title: 'Bob only', readAt: null, createdAt: new Date('2026-10-18T12:00:00Z') }
  ];
  return {
    rows,
    staffNotification: {
      findMany: vi.fn(async ({ where, take }: { where: { platformUserId: string; readAt?: null }; take: number }) =>
        rows
          .filter((row) => matches(row, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take)
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string; platformUserId: string } }) => rows.find((row) => matches(row, where)) ?? null),
      count: vi.fn(async ({ where }: { where: { platformUserId: string; readAt?: null } }) => rows.filter((row) => matches(row, where)).length),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string; platformUserId: string; readAt?: null }; data: { readAt: Date } }) => {
        const hit = rows.filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      })
    }
  };
}

async function buildApp(prisma = createPrisma()) {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', prisma as never);
  const { registerStaffNotificationRoutes } = await import('./notifications.routes.js');
  await registerStaffNotificationRoutes(app);
  await app.ready();
  return { app, prisma };
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('staff notification bell (D6)', () => {
  it("ACC-FND-2 the bell returns only the caller's notifications, newest first, with an unread count", async () => {
    const { app } = await buildApp();
    const alice = await app.inject({ method: 'GET', url: '/api/internal/notifications/staff' });
    expect(alice.statusCode).toBe(200);
    const body = alice.json() as { data: Row[]; unreadCount: number };
    expect(body.data.map((row) => row.title)).toEqual(['Appeal', 'JIT request']);
    expect(body.unreadCount).toBe(2);

    const bob = await app.inject({ method: 'GET', url: '/api/internal/notifications/staff', headers: { 'x-test-user': 'pu_bob' } });
    expect((bob.json() as { data: Row[] }).data.map((row) => row.title)).toEqual(['Bob only']);
  });

  it('ACC-FND-2 read marks one of the caller’s rows; another user’s row is 404 and untouched', async () => {
    const { app, prisma } = await buildApp();
    const read = await app.inject({ method: 'POST', url: '/api/internal/notifications/staff/00000000-0000-4000-8000-000000000001/read' });
    expect(read.statusCode).toBe(200);
    expect(prisma.rows[0].readAt).toBeInstanceOf(Date);

    const foreign = await app.inject({ method: 'POST', url: '/api/internal/notifications/staff/00000000-0000-4000-8000-000000000003/read' });
    expect(foreign.statusCode).toBe(404);
    expect(prisma.rows[2].readAt).toBeNull();

    const unread = await app.inject({ method: 'GET', url: '/api/internal/notifications/staff?unread=true' });
    expect((unread.json() as { unreadCount: number }).unreadCount).toBe(1);
  });

  it('ACC-FND-2 read-all clears only the caller’s unread rows', async () => {
    const { app, prisma } = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/internal/notifications/staff/read-all' });
    expect(response.json()).toEqual({ updated: 2 });
    expect(prisma.rows.filter((row) => row.platformUserId === 'pu_alice').every((row) => row.readAt)).toBe(true);
    expect(prisma.rows[2].readAt).toBeNull();
  });

  it('rejects an invalid query', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/internal/notifications/staff?limit=500' });
    expect(response.statusCode).toBe(400);
  });
});
