import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: vi.fn(async (req: any) => {
    req.user = req.user ?? { sub: 'user-staff-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
  })
}));
vi.mock('../../shared/middleware/requireRole.js', () => ({
  requireRole: vi.fn(() => async () => {})
}));
vi.mock('../notifications/notifications.routes.js', () => ({
  createInAppNotifications: vi.fn(async () => {})
}));

import { registerSupportRoutes } from './support.routes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const OPEN_TICKET = {
  id: 'ticket-1', tenantId: 'tenant-1', ticketNumber: 'ACME-TKT-202506-0001',
  subject: 'My parcel is lost', category: 'DELIVERY_ISSUE', priority: 'HIGH',
  status: 'OPEN', assignedTo: null, customerId: 'user-customer-1', shipmentId: null
};

const STAFF_MESSAGE = { id: 'msg-1', ticketId: 'ticket-1', authorId: 'user-staff-1', body: 'We are investigating', isInternal: false };
const INTERNAL_MESSAGE = { id: 'msg-2', ticketId: 'ticket-1', authorId: 'user-staff-1', body: 'Internal note for team', isInternal: true };

// ─────────────────────────────────────────────────────────────────────────────
// App builder
// ─────────────────────────────────────────────────────────────────────────────

function buildApp(roleOverride = 'TENANT_ADMIN', ticketOverride?: any) {
  const app = Fastify();
  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'acme' }) },
    supportTicket: {
      findMany: vi.fn().mockResolvedValue([OPEN_TICKET]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'ticket-new', ...data })),
      findFirst: vi.fn().mockResolvedValue(ticketOverride ?? OPEN_TICKET),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...OPEN_TICKET, ...data }))
    },
    ticketMessage: {
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'msg-new', ...data })),
      findMany: vi.fn().mockResolvedValue([STAFF_MESSAGE])
    },
    notificationLog: { create: vi.fn().mockResolvedValue({}) },
    inAppNotification: { createMany: vi.fn().mockResolvedValue({}) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'user-ops-1' }]) }
  };

  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', async (req: any) => {
    req.user = { sub: roleOverride === 'CUSTOMER_USER' ? 'user-customer-1' : 'user-staff-1', role: roleOverride, tenantId: 'tenant-1' };
  });
  app.addHook('onRequest', (req, _reply, done) => {
    (req as any).tenant = { id: 'tenant-1', slug: 'acme', plan: 'PRO' };
    done();
  });

  return { app, prisma };
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  while (apps.length) {
    const ctx = apps.pop();
    if (ctx) await ctx.app.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/support/tickets
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/support/tickets', () => {
  it('creates ticket with OPEN status and generates a ticket number', async () => {
    const ctx = buildApp('CUSTOMER_USER');
    apps.push(ctx);
    await registerSupportRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/support/tickets',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'My parcel is missing', category: 'DELIVERY_ISSUE', message: 'Tracked it for 2 weeks, nothing arrived.' })
    });

    expect(res.statusCode).toBe(201);
    const created = ctx.prisma.supportTicket.create.mock.calls[0][0].data;
    // status is set by Prisma default (OPEN) — not in data payload
    expect(created.ticketNumber).toMatch(/^ACME-TKT-\d{6}-\d{4}$/);
    expect(created.tenantId).toBe('tenant-1');
  });

  it('creates ticket with nested first message (Prisma nested create)', async () => {
    const ctx = buildApp('CUSTOMER_USER');
    apps.push(ctx);
    await registerSupportRoutes(ctx.app as any);

    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/support/tickets',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Lost parcel', category: 'DELIVERY_ISSUE', message: 'I cannot find it.' })
    });

    // The first message is created via nested Prisma create, not a separate create call
    const createCall = ctx.prisma.supportTicket.create.mock.calls[0][0].data;
    expect(createCall.messages.create.body).toBe('I cannot find it.');
    expect(createCall.messages.create.isInternal).toBe(false);
  });

  it('calls createInAppNotifications for TENANT_ADMIN on new ticket', async () => {
    const { createInAppNotifications } = await import('../notifications/notifications.routes.js');
    const ctx = buildApp('CUSTOMER_USER');
    apps.push(ctx);
    await registerSupportRoutes(ctx.app as any);

    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/support/tickets',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Issue', category: 'OTHER', message: 'Need help' })
    });

    expect(createInAppNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'ticket_opened' })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/support/tickets — staff-only
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/support/tickets', () => {
  it('returns paginated ticket list for TENANT_ADMIN', async () => {
    const ctx = buildApp('TENANT_ADMIN');
    apps.push(ctx);
    await registerSupportRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/support/tickets',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().tickets).toHaveLength(1);
  });

  it('filters tickets by status when provided', async () => {
    const ctx = buildApp('TENANT_ADMIN');
    apps.push(ctx);
    await registerSupportRoutes(ctx.app as any);

    await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/support/tickets?status=OPEN',
      headers: { Authorization: 'Bearer token' }
    });

    expect(ctx.prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'OPEN' }) })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/support/tickets/:id/messages — internal notes visibility
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/support/tickets/:id/messages', () => {
  it('creates a non-internal reply and calls createInAppNotifications for customer', async () => {
    const { createInAppNotifications } = await import('../notifications/notifications.routes.js');
    const ctx = buildApp('TENANT_STAFF', OPEN_TICKET);
    apps.push(ctx);
    await registerSupportRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/support/tickets/ticket-1/messages',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'We are looking into this for you.', isInternal: false })
    });

    expect(res.statusCode).toBe(201);
    const messageData = ctx.prisma.ticketMessage.create.mock.calls[0][0].data;
    expect(messageData.isInternal).toBe(false);
    expect(createInAppNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'ticket_reply_from_staff' })
    );
  });

  it('creates an internal note and does NOT call createInAppNotifications', async () => {
    const { createInAppNotifications } = await import('../notifications/notifications.routes.js');
    const notifMock = vi.mocked(createInAppNotifications);
    notifMock.mockClear();

    const ctx = buildApp('TENANT_STAFF', OPEN_TICKET);
    apps.push(ctx);
    await registerSupportRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/support/tickets/ticket-1/messages',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Check with warehouse team', isInternal: true })
    });

    expect(res.statusCode).toBe(201);
    const messageData = ctx.prisma.ticketMessage.create.mock.calls[0][0].data;
    expect(messageData.isInternal).toBe(true);
    // Internal notes must not notify the customer
    expect(notifMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/support/tickets/:id/resolve
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/support/tickets/:id/resolve', () => {
  it('sets status to RESOLVED and calls createInAppNotifications', async () => {
    const { createInAppNotifications } = await import('../notifications/notifications.routes.js');
    const ctx = buildApp('TENANT_ADMIN', OPEN_TICKET);
    apps.push(ctx);
    await registerSupportRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/support/tickets/ticket-1/resolve',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RESOLVED' }) })
    );
    expect(createInAppNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'ticket_resolved' })
    );
  });
});
