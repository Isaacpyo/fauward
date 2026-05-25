import type { PolicyDecision } from './agent.types.js';
import type { ToolName } from './agent.tools.js';

export interface PolicyContext {
  tenantId: string;
  requestingTenantId: string;
  shipmentCurrentDriverId?: string | null;
  shipmentStatus?: string;
  isLabelPurchased?: boolean;
}

export function evaluatePolicy(tool: ToolName, ctx: PolicyContext): PolicyDecision {
  // BLOCKED: cross-tenant access — highest priority check
  if (ctx.requestingTenantId !== ctx.tenantId) return 'blocked';

  switch (tool) {
    // Always auto-approved: read-only and safe mutations
    case 'get_available_drivers':
    case 'get_shipment_details':
    case 'get_carrier_rates':
    case 'flag_sla_risk':
      return 'auto_approved';

    case 'send_customer_notification':
      return 'requires_approval';

    // All scoped analytics tools: auto-approved (read-only, tenant-scoped)
    case 'get_failed_shipments_count':
    case 'get_delay_reasons':
    case 'get_sla_breach_rate':
    case 'get_driver_performance':
    case 'get_carrier_performance':
    case 'get_shipments_by_status':
    case 'get_weekly_operations_summary':
      return 'auto_approved';

    // Auto-approved only for unassigned shipments; reassignment requires approval
    case 'assign_shipment':
      return ctx.shipmentCurrentDriverId ? 'requires_approval' : 'auto_approved';

    // Rerouting an active shipment always requires human approval
    case 'reroute_shipment':
      return 'requires_approval';

    default:
      return 'blocked';
  }
}
