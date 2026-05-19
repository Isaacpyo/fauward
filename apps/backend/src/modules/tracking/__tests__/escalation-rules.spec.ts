import { describe, expect, it } from 'vitest';
import { ESCALATION_RULES } from '../escalation/rules.js';
import type { RuleContext } from '../escalation/rules.js';

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    shipmentStatus: 'IN_TRANSIT',
    lastSeenAt: new Date(Date.now() - 20 * 60_000),
    eventType: 'location',
    now: new Date(),
    ...overrides,
  };
}

describe('staleGpsRule', () => {
  const rule = ESCALATION_RULES.find((r) => r.code === 'stale_gps')!;

  it('fires when last seen > 15 min ago and status is IN_TRANSIT', () => {
    expect(rule.evaluate(ctx())).toBe(true);
  });

  it('fires for OUT_FOR_DELIVERY', () => {
    expect(rule.evaluate(ctx({ shipmentStatus: 'OUT_FOR_DELIVERY' }))).toBe(true);
  });

  it('does not fire for PENDING', () => {
    expect(rule.evaluate(ctx({ shipmentStatus: 'PENDING' }))).toBe(false);
  });

  it('does not fire when last seen is recent', () => {
    expect(rule.evaluate(ctx({ lastSeenAt: new Date() }))).toBe(false);
  });
});

describe('stuckInStatusRule', () => {
  const rule = ESCALATION_RULES.find((r) => r.code === 'stuck_in_status')!;

  it('fires for OUT_FOR_DELIVERY > 4h', () => {
    expect(rule.evaluate(ctx({
      shipmentStatus: 'OUT_FOR_DELIVERY',
      lastSeenAt: new Date(Date.now() - 5 * 3_600_000),
    }))).toBe(true);
  });

  it('fires for IN_TRANSIT > slaHours', () => {
    expect(rule.evaluate(ctx({
      lastSeenAt: new Date(Date.now() - 50 * 3_600_000),
      slaHours: 48,
    }))).toBe(true);
  });

  it('does not fire when under threshold', () => {
    expect(rule.evaluate(ctx({
      shipmentStatus: 'OUT_FOR_DELIVERY',
      lastSeenAt: new Date(Date.now() - 3 * 3_600_000),
    }))).toBe(false);
  });
});

describe('exceptionStatusRule', () => {
  const rule = ESCALATION_RULES.find((r) => r.code === 'exception_status')!;

  it('fires for DELIVERY_FAILED', () => {
    expect(rule.evaluate(ctx({ eventType: 'status', eventStatus: 'DELIVERY_FAILED' }))).toBe(true);
  });

  it('fires for RETURNED', () => {
    expect(rule.evaluate(ctx({ eventType: 'status', eventStatus: 'RETURNED' }))).toBe(true);
  });

  it('does not fire for DELIVERED', () => {
    expect(rule.evaluate(ctx({ eventType: 'status', eventStatus: 'DELIVERED' }))).toBe(false);
  });
});

describe('manualFlagRule', () => {
  const rule = ESCALATION_RULES.find((r) => r.code === 'manual')!;

  it('fires for flag event', () => {
    expect(rule.evaluate(ctx({ eventType: 'flag' }))).toBe(true);
  });

  it('does not fire for location event', () => {
    expect(rule.evaluate(ctx({ eventType: 'location' }))).toBe(false);
  });
});
