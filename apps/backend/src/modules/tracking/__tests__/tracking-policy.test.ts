import { describe, it, expect } from 'vitest';
import { validateTrackingTransition, getAllowedNextStatuses, isTerminalStatus } from '../tracking-policy.service.js';

describe('validateTrackingTransition', () => {
  it('allows valid transitions', () => {
    expect(validateTrackingTransition('CREATED', 'BOOKED')).toEqual({ allowed: true });
    expect(validateTrackingTransition('PICKED_UP', 'IN_TRANSIT')).toEqual({ allowed: true });
    expect(validateTrackingTransition('OUT_FOR_DELIVERY', 'DELIVERED')).toEqual({ allowed: true });
    expect(validateTrackingTransition('OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED')).toEqual({ allowed: true });
  });

  it('rejects invalid transitions', () => {
    const result = validateTrackingTransition('CREATED', 'DELIVERED');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Invalid transition/);
  });

  it('allows invalid transition with an override reason', () => {
    const result = validateTrackingTransition('CREATED', 'DELIVERED', {
      overrideReason: 'Test correction'
    });
    expect(result.allowed).toBe(true);
  });

  it('rejects transition from terminal status without override reason', () => {
    const result = validateTrackingTransition('DELIVERED', 'IN_TRANSIT');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/terminal/);
  });

  it('allows transition from terminal status with override reason', () => {
    const result = validateTrackingTransition('DELIVERED', 'IN_TRANSIT', {
      overrideReason: 'Data correction'
    });
    expect(result.allowed).toBe(true);
  });

  it('rejects same-status transition', () => {
    const result = validateTrackingTransition('IN_TRANSIT', 'IN_TRANSIT');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Already in status/);
  });
});

describe('getAllowedNextStatuses', () => {
  it('returns correct transitions from CREATED', () => {
    const next = getAllowedNextStatuses('CREATED');
    expect(next).toContain('BOOKED');
    expect(next).toContain('CANCELLED');
  });

  it('returns empty array for DELIVERED', () => {
    expect(getAllowedNextStatuses('DELIVERED')).toEqual(['RETURN_STARTED']);
  });

  it('returns empty array for RETURNED', () => {
    expect(getAllowedNextStatuses('RETURNED')).toEqual([]);
  });
});

describe('isTerminalStatus', () => {
  it('identifies terminal statuses', () => {
    expect(isTerminalStatus('DELIVERED')).toBe(true);
    expect(isTerminalStatus('RETURNED')).toBe(true);
    expect(isTerminalStatus('CANCELLED')).toBe(true);
  });

  it('does not flag active statuses as terminal', () => {
    expect(isTerminalStatus('IN_TRANSIT')).toBe(false);
    expect(isTerminalStatus('OUT_FOR_DELIVERY')).toBe(false);
    expect(isTerminalStatus('CREATED')).toBe(false);
  });
});
