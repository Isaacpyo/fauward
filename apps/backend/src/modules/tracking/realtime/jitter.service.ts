import type { IngestPoint } from './types.js';
import type { HotState } from './types.js';

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export function shouldDropForJitter(
  currentState: HotState | null,
  incoming: IngestPoint,
  thresholdM = 10
): boolean {
  if (!currentState) return false;
  if (!currentState.lat || !currentState.lng) return false;
  if (incoming.status && incoming.status !== currentState.status) return false;

  const distance = haversineDistanceM(
    parseFloat(currentState.lat),
    parseFloat(currentState.lng),
    incoming.lat,
    incoming.lng
  );

  return distance < thresholdM;
}
