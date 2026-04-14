import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

import { generateApiKey, apiKeyService } from './api-keys.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// generateApiKey (pure function)
// ─────────────────────────────────────────────────────────────────────────────

describe('generateApiKey', () => {
  it('raw key starts with fw_', () => {
    const { raw } = generateApiKey();
    expect(raw).toMatch(/^fw_/);
  });

  it('prefix is the first 8 characters of the raw key', () => {
    const { raw, prefix } = generateApiKey();
    expect(raw.startsWith(prefix)).toBe(true);
    expect(prefix).toHaveLength(8);
  });

  it('hash is the SHA-256 of the raw key', () => {
    const { raw, hash } = generateApiKey();
    const expected = createHash('sha256').update(raw).digest('hex');
    expect(hash).toBe(expected);
  });

  it('hash has length 64 (SHA-256 hex)', () => {
    const { hash } = generateApiKey();
    expect(hash).toHaveLength(64);
  });

  it('two calls produce different keys', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });

  it('raw key is not stored — only the hash is', () => {
    const { raw, hash } = generateApiKey();
    // The raw value should NOT equal the hash
    expect(raw).not.toBe(hash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// apiKeyService
// ─────────────────────────────────────────────────────────────────────────────

describe('apiKeyService.create', () => {
  it('stores only the hash — not the raw key — in the database', async () => {
    const prisma = {
      apiKey: {
        create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'key-1', ...data }))
      }
    } as any;

    const { key, record } = await apiKeyService.create(prisma, 'tenant-1', 'Test Key');

    expect(key).toMatch(/^fw_/);
    const storedHash = prisma.apiKey.create.mock.calls[0][0].data.keyHash;
    expect(storedHash).not.toBe(key);                                  // raw not stored
    expect(storedHash).toBe(createHash('sha256').update(key).digest('hex')); // hash stored
    expect(record.tenantId).toBe('tenant-1');
  });

  it('sets isActive = true on creation', async () => {
    const prisma = {
      apiKey: { create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'key-1', ...data })) }
    } as any;

    await apiKeyService.create(prisma, 'tenant-1');

    const storedData = prisma.apiKey.create.mock.calls[0][0].data;
    expect(storedData.isActive).toBe(true);
  });

  it('sets default rateLimit of 500', async () => {
    const prisma = {
      apiKey: { create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'key-1', ...data })) }
    } as any;

    await apiKeyService.create(prisma, 'tenant-1');

    const storedData = prisma.apiKey.create.mock.calls[0][0].data;
    expect(storedData.rateLimit).toBe(500);
  });

  it('trims whitespace from the key name', async () => {
    const prisma = {
      apiKey: { create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'key-1', ...data })) }
    } as any;

    await apiKeyService.create(prisma, 'tenant-1', '  My Key  ');

    const storedData = prisma.apiKey.create.mock.calls[0][0].data;
    expect(storedData.name).toBe('My Key');
  });

  it('stores null name when no name provided', async () => {
    const prisma = {
      apiKey: { create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'key-1', ...data })) }
    } as any;

    await apiKeyService.create(prisma, 'tenant-1');

    const storedData = prisma.apiKey.create.mock.calls[0][0].data;
    expect(storedData.name).toBeNull();
  });
});

describe('apiKeyService.revoke', () => {
  it('sets isActive = false and scopes the update to the correct tenant', async () => {
    const prisma = {
      apiKey: { update: vi.fn().mockResolvedValue({ id: 'key-1', isActive: false }) }
    } as any;

    await apiKeyService.revoke(prisma, 'tenant-1', 'key-1');

    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1', tenantId: 'tenant-1' },
      data: { isActive: false }
    });
  });
});

describe('apiKeyService.list', () => {
  it('lists only keys for the specified tenant', async () => {
    const prisma = {
      apiKey: { findMany: vi.fn().mockResolvedValue([]) }
    } as any;

    await apiKeyService.list(prisma, 'tenant-1');

    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' } })
    );
  });
});
