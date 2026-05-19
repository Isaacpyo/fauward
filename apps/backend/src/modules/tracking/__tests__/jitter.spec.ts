import { describe, expect, it } from 'vitest';
import { haversineDistanceM, shouldDropForJitter } from '../realtime/jitter.service.js';
import type { HotState, IngestPoint } from '../realtime/types.js';

describe('haversineDistanceM', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceM(51.5074, -0.1278, 51.5074, -0.1278)).toBe(0);
  });

  it('returns ~111km for 1 degree latitude difference', () => {
    const d = haversineDistanceM(51.5074, -0.1278, 52.5074, -0.1278);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('returns ~5m for small offset', () => {
    const d = haversineDistanceM(51.5074, -0.1278, 51.50745, -0.1278);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(10);
  });
});

describe('shouldDropForJitter', () => {
  it('does not drop when no current state', () => {
    const point: IngestPoint = { lat: 51.5074, lng: -0.1278, ts: new Date().toISOString() };
    expect(shouldDropForJitter(null, point, 10)).toBe(false);
  });

  it('does not drop when status changed', () => {
    const state: HotState = { lat: '51.5074', lng: '-0.1278', status: 'PENDING', seq: '1' };
    const point: IngestPoint = { lat: 51.50741, lng: -0.12781, ts: new Date().toISOString(), status: 'IN_TRANSIT' };
    expect(shouldDropForJitter(state, point, 10)).toBe(false);
  });

  it('drops when within threshold and status unchanged', () => {
    const state: HotState = { lat: '51.5074', lng: '-0.1278', status: 'IN_TRANSIT', seq: '1' };
    const point: IngestPoint = { lat: 51.50741, lng: -0.12781, ts: new Date().toISOString(), status: 'IN_TRANSIT' };
    expect(shouldDropForJitter(state, point, 10)).toBe(true);
  });

  it('does not drop when beyond threshold', () => {
    const state: HotState = { lat: '51.5074', lng: '-0.1278', status: 'IN_TRANSIT', seq: '1' };
    const point: IngestPoint = { lat: 51.5080, lng: -0.1280, ts: new Date().toISOString(), status: 'IN_TRANSIT' };
    expect(shouldDropForJitter(state, point, 10)).toBe(false);
  });

  it('drops 9 subsequent points within 5m when state exists', () => {
    const state: HotState = { lat: '51.5074', lng: '-0.1278', status: 'IN_TRANSIT', seq: '1' };
    let dropped = 0;
    for (let i = 1; i < 10; i++) {
      const point: IngestPoint = {
        lat: 51.5074 + i * 0.000002,
        lng: -0.1278 + i * 0.000002,
        ts: new Date().toISOString(),
      };
      if (shouldDropForJitter(state, point, 10)) dropped++;
    }
    expect(dropped).toBe(9);
  });
});
