import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

import { resolveIdempotency, storeIdempotencyResult } from './idempotency.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildRequest(overrides: {
  tenantId?: string;
  idempotencyKey?: string;
  body?: unknown;
  existingRecord?: { response?: unknown; statusCode?: number } | null;
}) {
  const tenantId = overrides.tenantId ?? 'tenant-1';
  const idempotencyKey = overrides.idempotencyKey ?? undefined;
  const existing = overrides.existingRecord !== undefined ? overrides.existingRecord : null;

  const prisma = {
    idempotencyKey: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({})
    }
  };

  const request = {
    tenant: { id: tenantId },
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
    body: overrides.body ?? {},
    server: { prisma }
  } as any;

  const reply = {} as any;

  return { request, reply, prisma };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveIdempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveIdempotency', () => {
  it('returns bypass when no Idempotency-Key header is present', async () => {
    const { request, reply } = buildRequest({ idempotencyKey: undefined });

    const result = await resolveIdempotency(request, reply);

    expect(result.type).toBe('bypass');
  });

  it('returns bypass when there is no tenant context', async () => {
    const { request, reply } = buildRequest({ tenantId: undefined as any, idempotencyKey: 'key-1' });
    request.tenant = undefined;

    const result = await resolveIdempotency(request, reply);

    expect(result.type).toBe('bypass');
  });

  it('returns new + inserts row on first request with a key', async () => {
    const { request, reply, prisma } = buildRequest({
      idempotencyKey: 'my-idempotency-key',
      existingRecord: null
    });

    const result = await resolveIdempotency(request, reply);

    expect(result.type).toBe('new');
    if (result.type === 'new') {
      expect(result.key).toBe('my-idempotency-key');
    }
    expect(prisma.idempotencyKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          key: 'my-idempotency-key',
          expiresAt: expect.any(Date)
        })
      })
    );
  });

  it('sets expiry to 24 hours in the future', async () => {
    const before = Date.now();
    const { request, reply, prisma } = buildRequest({ idempotencyKey: 'ttl-key', existingRecord: null });

    await resolveIdempotency(request, reply);

    const createCall = prisma.idempotencyKey.create.mock.calls[0][0];
    const expiresAt: Date = createCall.data.expiresAt;
    const diffMs = expiresAt.getTime() - before;
    expect(diffMs).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000); // at least 23 hours
    expect(diffMs).toBeLessThanOrEqual(25 * 60 * 60 * 1000); // at most 25 hours
  });

  it('returns duplicate when an existing COMPLETED record is found', async () => {
    const cachedResponse = { id: 'ship-1', status: 'PENDING' };
    const { request, reply } = buildRequest({
      idempotencyKey: 'completed-key',
      existingRecord: { response: cachedResponse, statusCode: 201 }
    });

    const result = await resolveIdempotency(request, reply);

    expect(result.type).toBe('duplicate');
    if (result.type === 'duplicate') {
      expect(result.statusCode).toBe(201);
      expect(result.response).toEqual(cachedResponse);
    }
  });

  it('returns processing when an existing PROCESSING record (no response yet) is found', async () => {
    const { request, reply } = buildRequest({
      idempotencyKey: 'in-flight-key',
      existingRecord: { response: undefined, statusCode: undefined } // no response stored yet
    });

    const result = await resolveIdempotency(request, reply);

    expect(result.type).toBe('processing');
  });

  it('stores the SHA-256 body hash in the new row', async () => {
    const body = { shipmentId: 'ship-1', weight: 5 };
    const { request, reply, prisma } = buildRequest({ idempotencyKey: 'body-hash-key', existingRecord: null, body });

    await resolveIdempotency(request, reply);

    const createCall = prisma.idempotencyKey.create.mock.calls[0][0];
    const expected = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    expect(createCall.data.requestHash).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// storeIdempotencyResult
// ─────────────────────────────────────────────────────────────────────────────

describe('storeIdempotencyResult', () => {
  it('updates the idempotency row with statusCode and response', async () => {
    const { request, reply, prisma } = buildRequest({ idempotencyKey: 'store-key' });

    const response = { id: 'ship-1', trackingNumber: 'ACME-202506-XYZ' };
    await storeIdempotencyResult(request, 'store-key', 201, response);

    expect(prisma.idempotencyKey.update).toHaveBeenCalledWith({
      where: { tenantId_key: { tenantId: 'tenant-1', key: 'store-key' } },
      data: expect.objectContaining({ statusCode: 201, response })
    });
  });

  it('does nothing when there is no tenant context', async () => {
    const { request, reply, prisma } = buildRequest({ idempotencyKey: 'store-key' });
    request.tenant = undefined;

    await storeIdempotencyResult(request, 'store-key', 201, {});

    expect(prisma.idempotencyKey.update).not.toHaveBeenCalled();
  });
});
