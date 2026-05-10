import { config } from '../../config/index.js';
import type { Objective, OptimizerRequest, OptimizerResponse, EtaTrainingRow, Coordinate } from './routing.types.js';

export function extractCoords(address: unknown): Coordinate | null {
  if (!address || typeof address !== 'object') return null;
  const a = address as Record<string, unknown>;
  if (typeof a.lat === 'number' && typeof a.lng === 'number') return { lat: a.lat, lng: a.lng };
  if (typeof a.latitude === 'number' && typeof a.longitude === 'number') return { lat: a.latitude, lng: a.longitude };
  return null;
}

export function tierToObjective(serviceTier: string): Objective {
  if (serviceTier === 'EXPRESS' || serviceTier === 'OVERNIGHT') return 'MIN_TIME';
  if (serviceTier === 'ECONOMY') return 'MIN_DISTANCE';
  return 'BALANCED';
}

export async function callOptimizer(request: OptimizerRequest): Promise<OptimizerResponse> {
  const url = `${config.routeOptimizerUrl}/v1/optimize`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Route optimizer returned ${response.status}: ${body}`);
  }
  return response.json() as Promise<OptimizerResponse>;
}

export async function callEtaTrain(rows: EtaTrainingRow[]): Promise<{ trained: boolean; rowsUsed: number }> {
  const url = `${config.routeOptimizerUrl}/v1/eta/train`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ETA train returned ${response.status}: ${body}`);
  }
  return response.json() as Promise<{ trained: boolean; rowsUsed: number }>;
}

export async function checkOptimizerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${config.routeOptimizerUrl}/v1/health`, {
      signal: AbortSignal.timeout(5_000)
    });
    return response.ok;
  } catch {
    return false;
  }
}
