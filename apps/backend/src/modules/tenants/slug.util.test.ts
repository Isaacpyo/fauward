import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { deriveSlug, findAvailableSlug, isValidSlugFormat } from './slug.util.js';
import { isReservedSlug } from './reserved-slugs.js';

function prismaWithSlugs(args: { active?: string[]; history?: string[] } = {}) {
  const active = new Set(args.active ?? []);
  const history = new Set(args.history ?? []);
  return {
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => (
        active.has(where.slug) ? { id: `tenant-${where.slug}` } : null
      ))
    },
    tenantSlugHistory: {
      findUnique: vi.fn(async ({ where }: { where: { oldSlug: string } }) => (
        history.has(where.oldSlug) ? { id: `history-${where.oldSlug}` } : null
      ))
    }
  } as unknown as PrismaClient;
}

describe('tenant slug utilities', () => {
  it('derives normalized slugs from display names', () => {
    expect(deriveSlug('Acme Logistics Ltd!')).toBe('acme-logistics-ltd');
    expect(deriveSlug('Cafe Evia')).toBe('cafe-evia');
    expect(deriveSlug('  --Hello---World--  ')).toBe('hello-world');
    expect(deriveSlug('!!!')).toBe('');
  });

  it('validates slug format', () => {
    expect(isValidSlugFormat('ab')).toBe(true);
    expect(isValidSlugFormat('a-b-c')).toBe(true);
    expect(isValidSlugFormat('a'.repeat(40))).toBe(true);
    expect(isValidSlugFormat('a')).toBe(false);
    expect(isValidSlugFormat('-abc')).toBe(false);
    expect(isValidSlugFormat('abc-')).toBe(false);
    expect(isValidSlugFormat('ABC')).toBe(false);
    expect(isValidSlugFormat('a_b')).toBe(false);
    expect(isValidSlugFormat('a--b')).toBe(true);
    expect(isValidSlugFormat('a'.repeat(41))).toBe(false);
  });

  it('checks reserved slugs case-insensitively', () => {
    expect(isReservedSlug('admin')).toBe(true);
    expect(isReservedSlug('API')).toBe(true);
    expect(isReservedSlug('Stripe')).toBe(true);
    expect(isReservedSlug('acme-logistics')).toBe(false);
  });

  it('finds a free slug while skipping active, historical, and reserved slugs', async () => {
    await expect(findAvailableSlug(prismaWithSlugs(), 'acme')).resolves.toBe('acme');
    await expect(findAvailableSlug(prismaWithSlugs({ active: ['acme'] }), 'acme')).resolves.toBe('acme-2');
    await expect(findAvailableSlug(prismaWithSlugs({ active: ['acme'], history: ['acme-2'] }), 'acme')).resolves.toBe('acme-3');
    await expect(findAvailableSlug(prismaWithSlugs(), 'admin')).resolves.toBe('admin-2');
  });
});
