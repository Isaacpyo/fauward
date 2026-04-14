import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock middleware so route handlers are testable without real auth/DB calls
vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: vi.fn(async (req: any) => {
    req.user = req.user ?? { sub: 'user-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
  })
}));
vi.mock('../../shared/middleware/featureGuard.js', () => ({
  requireFeature: vi.fn(() => async () => { /* no-op: plan check bypassed in tests */ })
}));
vi.mock('../../shared/middleware/requireRole.js', () => ({
  requireRole: vi.fn(() => async () => { /* no-op: role check bypassed in tests */ })
}));
vi.mock('../../shared/middleware/idempotency.js', () => ({
  resolveIdempotency: vi.fn(async () => ({ type: 'bypass' })),
  storeIdempotencyResult: vi.fn(async () => {})
}));

import { registerCrmRoutes } from './crm.routes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const PROSPECT_LEAD = { id: 'lead-1', tenantId: 'tenant-1', company: 'Acme Corp', stage: 'PROSPECT', contactName: 'Jane Doe', email: 'jane@acme.com' };
const WON_LEAD = { ...PROSPECT_LEAD, stage: 'WON' };

const DRAFT_QUOTE = {
  id: 'quote-1', tenantId: 'tenant-1', quoteNumber: 'ACME-QTE-202506-0001', status: 'DRAFT',
  total: 200, currency: 'GBP', leadId: 'lead-1', customerId: null, organisationId: null,
  shipmentData: { originAddress: { line1: '1 A St', city: 'London' }, destinationAddress: { line1: '2 B Rd', city: 'Manchester' } }
};

// ─────────────────────────────────────────────────────────────────────────────
// App builder
// ─────────────────────────────────────────────────────────────────────────────

function buildApp() {
  const app = Fastify();
  const prisma = {
    lead: {
      findMany: vi.fn().mockResolvedValue([PROSPECT_LEAD]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'lead-new', ...data })),
      findFirst: vi.fn().mockResolvedValue(PROSPECT_LEAD),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...PROSPECT_LEAD, ...data }))
    },
    quote: {
      findFirst: vi.fn().mockResolvedValue(DRAFT_QUOTE),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'quote-new', ...data })),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...DRAFT_QUOTE, ...data })),
      count: vi.fn().mockResolvedValue(0)
    },
    shipment: {
      create: vi.fn().mockResolvedValue({ id: 'ship-1', trackingNumber: 'ACME-202506-XYZ123' }),
      findUnique: vi.fn().mockResolvedValue(null) // for tracking number uniqueness check
    },
    notificationLog: { create: vi.fn().mockResolvedValue({}) },
    idempotencyKey: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({})
    },
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === 'function') return cb(prisma);
      return Promise.all(cb);
    })
  };

  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', async (req: any) => {
    req.user = { sub: 'user-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
  });
  app.addHook('onRequest', (req, _reply, done) => {
    (req as any).tenant = { id: 'tenant-1', slug: 'acme', plan: 'PRO', defaultCurrency: 'GBP' };
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
// GET /api/v1/crm/leads
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/crm/leads', () => {
  it('returns paginated leads scoped to tenant', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerCrmRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/crm/leads',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta).toMatchObject({ page: 1, limit: 20 });
    expect(ctx.prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) })
    );
  });

  it('filters leads by stage when provided', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerCrmRoutes(ctx.app as any);

    await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/crm/leads?stage=PROSPECT',
      headers: { Authorization: 'Bearer token' }
    });

    expect(ctx.prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ stage: 'PROSPECT' }) })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/crm/leads
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/crm/leads', () => {
  it('creates lead with PROSPECT stage and tenant scope', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerCrmRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/crm/leads',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'BigCo', contactName: 'Bob', email: 'bob@bigco.com' })
    });

    expect(res.statusCode).toBe(201);
    const created = ctx.prisma.lead.create.mock.calls[0][0].data;
    expect(created.stage).toBe('PROSPECT');
    expect(created.tenantId).toBe('tenant-1');
    expect(created.company).toBe('BigCo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/crm/quotes/:id/accept
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/crm/quotes/:id/accept', () => {
  it('creates a Shipment from the quote shipment_data on accept', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerCrmRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/crm/quotes/quote-1/accept',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.shipment.create).toHaveBeenCalledTimes(1);
    const shipmentData = ctx.prisma.shipment.create.mock.calls[0][0].data;
    expect(shipmentData.tenantId).toBe('tenant-1');
    expect(shipmentData.price).toBe(200); // from quote.total
  });

  it('links shipment_id back to the quote after acceptance', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerCrmRoutes(ctx.app as any);

    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/crm/quotes/quote-1/accept',
      headers: { Authorization: 'Bearer token' }
    });

    expect(ctx.prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACCEPTED', shipmentId: expect.any(String) })
      })
    );
  });

  it('marks the linked lead as WON on quote acceptance', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerCrmRoutes(ctx.app as any);

    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/crm/quotes/quote-1/accept',
      headers: { Authorization: 'Bearer token' }
    });

    expect(ctx.prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: 'WON' }) })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/crm/quotes/:id — DRAFT-only constraint
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/crm/quotes/:id', () => {
  it('allows update on a DRAFT quote', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerCrmRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/crm/quotes/quote-1',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ total: 250 })
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.quote.update).toHaveBeenCalled();
  });

  it('rejects update on non-DRAFT quote with 400', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    ctx.prisma.quote.findFirst = vi.fn().mockResolvedValue({ ...DRAFT_QUOTE, status: 'SENT' });
    await registerCrmRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/crm/quotes/quote-1',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ total: 999 })
    });

    expect(res.statusCode).toBe(400);
    expect(ctx.prisma.quote.update).not.toHaveBeenCalled();
  });
});
