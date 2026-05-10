import { readFileSync } from 'fs';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerLabelRoutes } from './label.routes.js';
import { labelService } from './label.service.js';
import { publishPythonServiceJob } from '../../queues/python-services.js';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async (value: string) => `data:image/png;base64,qr-${value}`)
  }
}));

vi.mock('../../queues/python-services.js', () => ({
  publishPythonServiceJob: vi.fn(async () => undefined)
}));

vi.mock('@fauward/theme-engine', () => ({
  resolveTenantBranding: vi.fn((tenant: any) => {
    const primary = tenant?.primaryColour ?? tenant?.primaryColor ?? '#0D1F3C';
    const accent = tenant?.accentColour ?? tenant?.accentColor ?? '#D97706';
    return {
      brandName: tenant?.brandName ?? tenant?.name ?? 'Fauward',
      logoUrl: tenant?.logoUrl ?? null,
      primaryColour: primary,
      primaryColor: primary,
      accentColour: accent,
      accentColor: accent,
      fontFamily: tenant?.fontFamily ?? 'Arial, sans-serif'
    };
  })
}));

vi.mock('../tracking/tracking-event.service.js', () => ({
  createTrackingEvent: vi.fn(async () => undefined),
  buildStatusTitle: vi.fn(() => 'Label generated'),
  statusToEventType: vi.fn(() => 'LABEL_GENERATED')
}));

vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: any) => {
    request.user = { sub: 'user-a', role: 'TENANT_ADMIN', tenantId: request.tenant?.id ?? 'tenant-a' };
  }
}));

vi.mock('../../shared/middleware/tenantMatch.js', () => ({
  requireTenantMatch: async () => undefined
}));

function fileUrlToPath(url: string) {
  return decodeURIComponent(url.replace(/^file:\/\//, ''));
}

async function buildTestApp() {
  const app = Fastify();
  const now = new Date('2026-05-02T10:00:00.000Z');
  const tenants = {
    'tenant-a': {
      id: 'tenant-a',
      name: 'Tenant A',
      brandName: 'A Logistics',
      logoUrl: 'https://cdn.example.com/a-logo.png',
      primaryColor: '#123456',
      accentColor: '#abcdef'
    },
    'tenant-b': {
      id: 'tenant-b',
      name: 'Tenant B',
      brandName: 'B Logistics',
      logoUrl: 'https://cdn.example.com/b-logo.png',
      primaryColor: '#654321',
      accentColor: '#fedcba'
    }
  };

  const shipments: any[] = [
    {
      id: 'ship-a',
      tenantId: 'tenant-a',
      tenant: tenants['tenant-a'],
      trackingNumber: 'FW-A-001',
      originAddress: { city: 'London', country: 'GB' },
      destinationAddress: { city: 'Lagos', country: 'NG', landmark: 'Red gate near market' },
      weightKg: 5,
      carrierAccountId: null,
      updatedAt: now
    },
    {
      id: 'ship-b',
      tenantId: 'tenant-b',
      tenant: tenants['tenant-b'],
      trackingNumber: 'FW-B-001',
      originAddress: { city: 'Manchester', country: 'GB' },
      destinationAddress: { city: 'Accra', country: 'GH' },
      weightKg: 2,
      carrierAccountId: null,
      updatedAt: now
    }
  ];
  const labels: any[] = [];

  const prisma = {
    shipment: {
      findFirst: vi.fn(async ({ where, include }: any) => {
        const shipment = shipments.find((row) => row.id === where.id && row.tenantId === where.tenantId);
        if (!shipment) return null;
        return include?.tenant ? shipment : { ...shipment, tenant: undefined };
      })
    },
    generatedLabel: {
      findFirst: vi.fn(async ({ where }: any) => {
        const rows = labels
          .filter((label) => {
            if (where.id && label.id !== where.id) return false;
            if (where.tenantId && label.tenantId !== where.tenantId) return false;
            if (where.shipmentId && label.shipmentId !== where.shipmentId) return false;
            if (where.format && label.format !== where.format) return false;
            return true;
          })
          .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
        return rows[0] ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const label = {
          id: `label-${labels.length + 1}`,
          ...data,
          generatedAt: new Date()
        };
        labels.push(label);
        return label;
      })
    },
    shipmentDocument: {
      create: vi.fn(async ({ data }: any) => ({ id: 'doc-1', ...data }))
    }
  };

  (app as any).decorate('prisma', prisma);
  app.addHook('onRequest', (request, _reply, done) => {
    const tenantId = String(request.headers['x-test-tenant'] ?? 'tenant-a');
    (request as any).tenant = { id: tenantId, slug: tenantId, name: tenantId, plan: 'PRO' };
    done();
  });

  await registerLabelRoutes(app as any);
  return { app, prisma, shipments, labels };
}

describe('label service and routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildTestApp>>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    while (apps.length) {
      const current = apps.pop();
      if (current) await current.app.close();
    }
  });

  it('POST /api/v1/tenant/shipments/:id/labels creates a GeneratedLabel and returns a download URL', async () => {
    const ctx = await buildTestApp();
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/tenant/shipments/ship-a/labels',
      payload: { format: 'PDF' }
    });

    expect(response.statusCode).toBe(201);
    const payload = response.json();
    expect(payload.downloadUrl).toMatch(/^file:\/\//);
    expect(ctx.labels).toHaveLength(1);
    expect(ctx.labels[0]).toEqual(expect.objectContaining({
      tenantId: 'tenant-a',
      shipmentId: 'ship-a',
      trackingNumber: 'FW-A-001'
    }));
  });

  it('generated PDF label content contains barcode, QR code, tracking number, and tenant logo', async () => {
    const ctx = await buildTestApp();
    apps.push(ctx);

    const label = await labelService.generate(ctx.app as any, 'tenant-a', 'ship-a', 'PDF' as any);
    const content = readFileSync(fileUrlToPath(label.url), 'utf-8');

    expect(content).toContain('Code128 barcode');
    expect(content).toContain('data:image/png;base64,qr-FW-A-001');
    expect(content).toContain('FW-A-001');
    expect(content).toContain('https://cdn.example.com/a-logo.png');
  });

  it('ZPL output contains the correct barcode data string', async () => {
    const ctx = await buildTestApp();
    apps.push(ctx);

    const label = await labelService.generate(ctx.app as any, 'tenant-a', 'ship-a', 'ZPL' as any);
    const content = readFileSync(fileUrlToPath(label.url), 'utf-8');

    expect(content).toContain('^BCN,90,Y,N,N^FDFW-A-001^FS');
    expect(content).toContain('^BQN,2,5^FDQA,FW-A-001^FS');
  });

  it('passes tenant logo from branding config to the Python label worker', async () => {
    const ctx = await buildTestApp();
    apps.push(ctx);

    await labelService.generate(ctx.app as any, 'tenant-a', 'ship-a', 'PDF' as any);

    expect(publishPythonServiceJob).toHaveBeenCalledWith(
      expect.anything(),
      'fauward:labels:generate',
      expect.objectContaining({
        brandingConfig: expect.objectContaining({
          brandName: 'A Logistics',
          logoUrl: 'https://cdn.example.com/a-logo.png',
          primaryColour: '#123456',
          primaryColor: '#123456',
          fontFamily: 'Arial, sans-serif',
          accentColor: '#abcdef'
        })
      })
    );
  });

  it('still enqueues label generation with default branding when tenant logo is missing', async () => {
    const ctx = await buildTestApp();
    apps.push(ctx);
    ctx.shipments[0].tenant.logoUrl = null;

    await expect(labelService.generate(ctx.app as any, 'tenant-a', 'ship-a', 'PDF' as any)).resolves.toBeTruthy();

    expect(publishPythonServiceJob).toHaveBeenCalledWith(
      expect.anything(),
      'fauward:labels:generate',
      expect.objectContaining({
        brandingConfig: expect.objectContaining({
          brandName: 'A Logistics',
          logoUrl: null
        })
      })
    );
  });

  it('reprint returns the same URL when the shipment is unchanged', async () => {
    const ctx = await buildTestApp();
    apps.push(ctx);

    const label = await labelService.generate(ctx.app as any, 'tenant-a', 'ship-a', 'PDF' as any);
    const reprint = await labelService.reprint(ctx.app as any, 'tenant-a', 'ship-a', label.id);

    expect(reprint?.url).toBe(label.url);
    expect(ctx.labels).toHaveLength(1);
  });

  it('reprint regenerates when the shipment changed after initial generation', async () => {
    const ctx = await buildTestApp();
    apps.push(ctx);

    const label = await labelService.generate(ctx.app as any, 'tenant-a', 'ship-a', 'PDF' as any);
    ctx.shipments[0].updatedAt = new Date(Date.now() + 10_000);

    const reprint = await labelService.reprint(ctx.app as any, 'tenant-a', 'ship-a', label.id);

    expect(reprint?.id).not.toBe(label.id);
    expect(reprint?.url).not.toBe(label.url);
    expect(ctx.labels).toHaveLength(2);
  });

  it('tenant A cannot download tenant B label', async () => {
    const ctx = await buildTestApp();
    apps.push(ctx);
    const tenantBLabel = await labelService.generate(ctx.app as any, 'tenant-b', 'ship-b', 'PDF' as any);

    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tenant/shipments/ship-b/labels/${tenantBLabel.id}`,
      headers: { 'x-test-tenant': 'tenant-a' }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Label not found' });
  });
});
