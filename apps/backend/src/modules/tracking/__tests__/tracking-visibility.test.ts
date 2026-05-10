import { describe, it, expect } from 'vitest';
import { filterEventsByVisibility } from '../tracking-visibility.service.js';

const makeEvent = (visibility: string) => ({
  id: Math.random().toString(),
  visibility: visibility as 'CUSTOMER_VISIBLE' | 'FIELD_VISIBLE' | 'TENANT_INTERNAL' | 'PLATFORM_ONLY'
});

describe('filterEventsByVisibility', () => {
  const events = [
    makeEvent('CUSTOMER_VISIBLE'),
    makeEvent('FIELD_VISIBLE'),
    makeEvent('TENANT_INTERNAL'),
    makeEvent('PLATFORM_ONLY')
  ];

  it('customer level sees only CUSTOMER_VISIBLE events', () => {
    const result = filterEventsByVisibility(events, 'customer');
    expect(result).toHaveLength(1);
    expect(result[0].visibility).toBe('CUSTOMER_VISIBLE');
  });

  it('field level sees CUSTOMER_VISIBLE and FIELD_VISIBLE events', () => {
    const result = filterEventsByVisibility(events, 'field');
    expect(result).toHaveLength(2);
    expect(result.every((e) => ['CUSTOMER_VISIBLE', 'FIELD_VISIBLE'].includes(e.visibility))).toBe(true);
  });

  it('tenant level sees customer + field + internal events', () => {
    const result = filterEventsByVisibility(events, 'tenant');
    expect(result).toHaveLength(3);
    expect(result.every((e) => e.visibility !== 'PLATFORM_ONLY')).toBe(true);
  });

  it('platform level sees all events', () => {
    const result = filterEventsByVisibility(events, 'platform');
    expect(result).toHaveLength(4);
  });

  it('customer level does not see internal or platform-only events', () => {
    const result = filterEventsByVisibility(events, 'customer');
    expect(result.find((e) => e.visibility === 'TENANT_INTERNAL')).toBeUndefined();
    expect(result.find((e) => e.visibility === 'PLATFORM_ONLY')).toBeUndefined();
  });
});
