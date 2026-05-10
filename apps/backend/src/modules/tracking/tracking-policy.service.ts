import { TrackingStatus, ALLOWED_TRACKING_TRANSITIONS, TERMINAL_STATUSES } from '@fauward/tracking-core';

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

export function validateTrackingTransition(
  from: TrackingStatus,
  to: TrackingStatus,
  options: { overrideReason?: string } = {}
): TransitionResult {
  if (from === to) {
    return { allowed: false, reason: `Already in status ${from}` };
  }

  if (TERMINAL_STATUSES.includes(from)) {
    if (options.overrideReason?.trim()) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Cannot transition from terminal status ${from} without an override reason`
    };
  }

  const allowed = ALLOWED_TRACKING_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) {
    return { allowed: true };
  }

  if (options.overrideReason?.trim()) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Invalid transition from ${from} to ${to}. Allowed: ${allowed.join(', ') || 'none'}`
  };
}

export function isTerminalStatus(status: TrackingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function getAllowedNextStatuses(from: TrackingStatus): TrackingStatus[] {
  return ALLOWED_TRACKING_TRANSITIONS[from] ?? [];
}
