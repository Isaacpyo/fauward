import { describe, expect, it } from 'vitest';
import { shouldDropForOrder } from '../realtime/order-filter.service.js';

describe('shouldDropForOrder', () => {
  it('does not drop when no current lastSeenAt', () => {
    expect(shouldDropForOrder(null, new Date().toISOString())).toBe(false);
  });

  it('does not drop when incoming is after current', () => {
    const current = new Date('2026-01-01T12:00:00Z').toISOString();
    const incoming = new Date('2026-01-01T12:01:00Z').toISOString();
    expect(shouldDropForOrder(current, incoming)).toBe(false);
  });

  it('does not drop when incoming is within 60s grace before current', () => {
    const current = new Date('2026-01-01T12:00:00Z').toISOString();
    const incoming = new Date('2026-01-01T11:59:10Z').toISOString();
    expect(shouldDropForOrder(current, incoming)).toBe(false);
  });

  it('drops when incoming is more than 60s before current', () => {
    const current = new Date('2026-01-01T12:00:00Z').toISOString();
    const incoming = new Date('2026-01-01T11:58:00Z').toISOString();
    expect(shouldDropForOrder(current, incoming)).toBe(true);
  });
});
