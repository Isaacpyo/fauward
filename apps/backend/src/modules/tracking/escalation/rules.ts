export interface EscalationRule {
  code: string;
  reason: string;
  evaluate: (ctx: RuleContext) => boolean;
}

export interface RuleContext {
  shipmentStatus: string;
  lastSeenAt: Date | null;
  eventType: 'location' | 'status' | 'flag' | 'unflag';
  eventStatus?: string;
  now: Date;
  slaHours?: number;
}

const STALE_GPS_MINUTES = 15;
const OUT_FOR_DELIVERY_HOURS = 4;
const AT_DEPOT_HOURS = 8;
const DEFAULT_SLA_HOURS = 48;

export const staleGpsRule: EscalationRule = {
  code: 'stale_gps',
  reason: 'GPS signal lost for more than 15 minutes',
  evaluate(ctx) {
    if (!['IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(ctx.shipmentStatus)) return false;
    if (!ctx.lastSeenAt) return false;
    const diffMin = (ctx.now.getTime() - ctx.lastSeenAt.getTime()) / 60_000;
    return diffMin > STALE_GPS_MINUTES;
  }
};

export const stuckInStatusRule: EscalationRule = {
  code: 'stuck_in_status',
  reason: 'Shipment has been in the same status for too long',
  evaluate(ctx) {
    if (!ctx.lastSeenAt) return false;
    const diffHours = (ctx.now.getTime() - ctx.lastSeenAt.getTime()) / 3_600_000;
    if (ctx.shipmentStatus === 'OUT_FOR_DELIVERY' && diffHours > OUT_FOR_DELIVERY_HOURS) return true;
    if (ctx.shipmentStatus === 'IN_TRANSIT' && diffHours > (ctx.slaHours ?? DEFAULT_SLA_HOURS)) return true;
    if (ctx.shipmentStatus === 'AT_DEPOT' && diffHours > AT_DEPOT_HOURS) return true;
    return false;
  }
};

export const exceptionStatusRule: EscalationRule = {
  code: 'exception_status',
  reason: '3PL reported an exception status',
  evaluate(ctx) {
    if (ctx.eventType !== 'status') return false;
    const exceptionStatuses = ['DELIVERY_FAILED', 'RETURNED', 'DAMAGED', 'ADDRESS_INVALID'];
    return exceptionStatuses.includes(ctx.eventStatus ?? '');
  }
};

export const manualFlagRule: EscalationRule = {
  code: 'manual',
  reason: 'Manually flagged by tenant staff',
  evaluate(ctx) {
    return ctx.eventType === 'flag';
  }
};

export const ESCALATION_RULES: EscalationRule[] = [
  staleGpsRule,
  stuckInStatusRule,
  exceptionStatusRule,
  manualFlagRule,
];
