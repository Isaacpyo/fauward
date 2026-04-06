import { describe, expect, it } from 'vitest';

import { ALLOWED_TRANSITIONS } from './shipments.routes.js';

describe('shipment state machine', () => {
  it('allows expected forward transitions', () => {
    expect(ALLOWED_TRANSITIONS.PENDING).toContain('PROCESSING');
    expect(ALLOWED_TRANSITIONS.PROCESSING).toContain('PICKED_UP');
    expect(ALLOWED_TRANSITIONS.OUT_FOR_DELIVERY).toContain('DELIVERED');
  });

  it('disallows invalid transitions', () => {
    expect(ALLOWED_TRANSITIONS.PENDING).not.toContain('DELIVERED');
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([]);
    expect(ALLOWED_TRANSITIONS.RETURNED).toEqual([]);
  });

  it('requires failed delivery to move through allowed path', () => {
    expect(ALLOWED_TRANSITIONS.FAILED_DELIVERY).toContain('OUT_FOR_DELIVERY');
    expect(ALLOWED_TRANSITIONS.FAILED_DELIVERY).not.toContain('DELIVERED');
  });
});
