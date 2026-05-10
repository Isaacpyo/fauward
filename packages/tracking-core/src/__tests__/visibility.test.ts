import { describe, it, expect } from 'vitest';
import { getAllowedVisibilities, canSeeVisibility, TrackingVisibility } from '../visibility.js';

describe('getAllowedVisibilities', () => {
  it('customer only gets CUSTOMER_VISIBLE', () => {
    const allowed = getAllowedVisibilities('customer');
    expect(allowed).toEqual(['CUSTOMER_VISIBLE']);
  });

  it('field gets CUSTOMER_VISIBLE and FIELD_VISIBLE', () => {
    const allowed = getAllowedVisibilities('field');
    expect(allowed).toContain('CUSTOMER_VISIBLE');
    expect(allowed).toContain('FIELD_VISIBLE');
    expect(allowed).not.toContain('TENANT_INTERNAL');
    expect(allowed).not.toContain('PLATFORM_ONLY');
  });

  it('tenant gets everything except PLATFORM_ONLY', () => {
    const allowed = getAllowedVisibilities('tenant');
    expect(allowed).toContain('CUSTOMER_VISIBLE');
    expect(allowed).toContain('FIELD_VISIBLE');
    expect(allowed).toContain('TENANT_INTERNAL');
    expect(allowed).not.toContain('PLATFORM_ONLY');
  });

  it('platform gets all visibility levels', () => {
    const allowed = getAllowedVisibilities('platform');
    expect(allowed).toContain('CUSTOMER_VISIBLE');
    expect(allowed).toContain('FIELD_VISIBLE');
    expect(allowed).toContain('TENANT_INTERNAL');
    expect(allowed).toContain('PLATFORM_ONLY');
  });
});

describe('canSeeVisibility', () => {
  it('customer cannot see TENANT_INTERNAL', () => {
    expect(canSeeVisibility('customer', TrackingVisibility.TENANT_INTERNAL)).toBe(false);
  });

  it('customer cannot see PLATFORM_ONLY', () => {
    expect(canSeeVisibility('customer', TrackingVisibility.PLATFORM_ONLY)).toBe(false);
  });

  it('customer can see CUSTOMER_VISIBLE', () => {
    expect(canSeeVisibility('customer', TrackingVisibility.CUSTOMER_VISIBLE)).toBe(true);
  });

  it('platform can see everything', () => {
    for (const v of Object.values(TrackingVisibility)) {
      expect(canSeeVisibility('platform', v)).toBe(true);
    }
  });

  it('tenant cannot see PLATFORM_ONLY', () => {
    expect(canSeeVisibility('tenant', TrackingVisibility.PLATFORM_ONLY)).toBe(false);
  });

  it('tenant can see TENANT_INTERNAL', () => {
    expect(canSeeVisibility('tenant', TrackingVisibility.TENANT_INTERNAL)).toBe(true);
  });
});
