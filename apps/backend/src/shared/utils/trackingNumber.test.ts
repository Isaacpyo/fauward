import { describe, expect, it, vi } from 'vitest';

import { generateTrackingNumber } from './trackingNumber.js';

describe('generateTrackingNumber', () => {
  it('generates expected format', async () => {
    const prisma = {
      shipment: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    } as any;

    const value = await generateTrackingNumber(prisma, 'northline');
    expect(value).toMatch(/^NO\d{4}-\d{2}-[A-Z0-9]{4}-\d{5}$/);
    expect(prisma.shipment.findUnique).toHaveBeenCalledTimes(1);
  });

  it('retries until unique candidate is found', async () => {
    const prisma = {
      shipment: {
        findUnique: vi.fn().mockResolvedValueOnce({ id: 'existing' }).mockResolvedValueOnce(null)
      }
    } as any;

    const value = await generateTrackingNumber(prisma, 'abc');
    expect(value).toMatch(/^AB\d{4}-\d{2}-[A-Z0-9]{4}-\d{5}$/);
    expect(prisma.shipment.findUnique).toHaveBeenCalledTimes(2);
  });
});
