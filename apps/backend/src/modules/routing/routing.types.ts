export type StopType = 'PICKUP' | 'DROPOFF';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH';
export type Objective = 'MIN_TIME' | 'MIN_DISTANCE' | 'BALANCED';
export type ViolationType = 'TIME_WINDOW_MISSED' | 'CAPACITY' | 'MAX_KM' | 'MAX_MINUTES';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface OptimizerStop {
  id: string;
  type: StopType;
  lat: number;
  lng: number;
  serviceMinutes?: number;
  timeWindow?: { start?: string; end?: string };
  priority?: Priority;
}

export interface OptimizerRequest {
  requestId: string;
  vehicle: {
    start: Coordinate;
    end?: Coordinate;
    capacity?: number;
  };
  constraints: {
    maxStops?: number;
    maxKm?: number;
    maxMinutes?: number;
  };
  stops: OptimizerStop[];
  options: {
    objective: Objective;
    seed?: number;
    explain?: boolean;
    useEtaModel?: boolean;
  };
}

export interface OptimizerLeg {
  from: string;
  to: string;
  distanceKm: number;
  durationMinutes: number;
  eta: string;
}

export interface OptimizerViolation {
  stopId: string;
  reason: ViolationType;
  details?: string;
}

export interface OptimizerRoute {
  orderedStopIds: string[];
  legs: OptimizerLeg[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  feasible: boolean;
  violations: OptimizerViolation[];
}

export interface OptimizerResponse {
  requestId: string;
  route: OptimizerRoute;
  explain?: {
    algorithm: string;
    notes: string[];
    score: { distanceKm: number; durationMinutes: number; violationPenalty: number };
  } | null;
}

export interface EtaTrainingRow {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  departedAt: string;
  arrivedAt: string;
}

export interface RouteOptimizationJob {
  routeId: string;
  tenantId: string;
  objective?: Objective;
  useEtaModel?: boolean;
  vehicleStart?: Coordinate;
}
