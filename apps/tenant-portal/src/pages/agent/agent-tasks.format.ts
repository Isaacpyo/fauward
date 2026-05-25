import type { ElementType } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  Clock,
  Flag,
  Package,
  PauseCircle,
  Truck,
  UserX,
  Users
} from "lucide-react";

import type { AgentAction } from "@/api/agent-actions";

const TOOL_ICONS: Record<string, ElementType> = {
  assign_shipment: Truck,
  reroute_shipment: Truck,
  get_shipment_details: Package,
  send_customer_notification: Bell,
  flag_sla_risk: Flag,
  get_available_drivers: Truck,
  get_carrier_rates: BarChart3,
  get_failed_shipments_count: BarChart3,
  get_delay_reasons: BarChart3,
  get_sla_breach_rate: BarChart3,
  get_driver_performance: BarChart3,
  get_carrier_performance: BarChart3,
  get_shipments_by_status: BarChart3,
  get_weekly_operations_summary: BarChart3
};

const FLAG_ICONS: Record<string, ElementType> = {
  unassigned: UserX,
  overloaded_driver: Users,
  past_deadline: Clock,
  failed_unhandled: AlertTriangle,
  stuck: PauseCircle
};

const FLAG_TITLES: Record<string, string> = {
  unassigned: "Unassigned shipment",
  overloaded_driver: "Driver overloaded",
  past_deadline: "Past deadline",
  failed_unhandled: "Failed delivery",
  stuck: "Stuck shipment"
};

function payloadKind(action: AgentAction): string {
  return String((action.payload as { kind?: unknown }).kind ?? "");
}

export function actionIcon(action: AgentAction): ElementType {
  if (action.type === "flag_finding") {
    return FLAG_ICONS[payloadKind(action)] ?? Flag;
  }
  return TOOL_ICONS[action.type] ?? Bot;
}

export function actionTitle(action: AgentAction): string {
  if (action.type === "flag_finding") {
    return FLAG_TITLES[payloadKind(action)] ?? "Flag";
  }
  const spaced = action.type.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function shortRef(id: unknown): string {
  return `#${String(id).slice(0, 8)}…`;
}

// Prefer the human-friendly tracking number when the detector has it; fall back to the
// truncated shipment id so flags never read as "(unknown)".
function shipmentRef(p: Record<string, unknown>): string {
  if (p.trackingNumber) return `#${String(p.trackingNumber)}`;
  if (p.shipmentId) return shortRef(p.shipmentId);
  return "(unknown)";
}

export function actionSummary(action: AgentAction): string {
  const p = action.payload;

  if (action.type === "flag_finding") {
    const kind = payloadKind(action);
    switch (kind) {
      case "unassigned": {
        const status = p.status ? ` (${String(p.status)})` : "";
        return `Shipment ${shipmentRef(p)}${status} has no driver assigned`;
      }
      case "overloaded_driver": {
        const name = String(p.driverName ?? "Driver");
        const count = Number(p.activeJobCount ?? 0);
        return `${name} has ${count} active jobs (threshold 8)`;
      }
      case "past_deadline": {
        const eta = p.estimatedDelivery
          ? new Date(String(p.estimatedDelivery)).toLocaleDateString()
          : null;
        return eta
          ? `Shipment ${shipmentRef(p)} is past its estimated delivery (${eta})`
          : `Shipment ${shipmentRef(p)} is past its estimated delivery`;
      }
      case "failed_unhandled": {
        const when = p.failedAt
          ? new Date(String(p.failedAt)).toLocaleDateString()
          : null;
        return when
          ? `Delivery ${shipmentRef(p)} failed ${when} and hasn't been re-actioned`
          : `Delivery ${shipmentRef(p)} failed and hasn't been re-actioned`;
      }
      case "stuck":
        return `Shipment ${shipmentRef(p)} has stalled (open exception case)`;
      default:
        return kind ? `Flagged ${kind.replaceAll("_", " ")}` : "Flagged finding";
    }
  }

  switch (action.type) {
    case "reroute_shipment": {
      const tail = p.reason ? ` — ${String(p.reason)}` : "";
      return `Reroute shipment ${shortRef(p.shipmentId)} to driver ${shortRef(p.newDriverId)}${tail}`;
    }
    case "assign_shipment": {
      const tail = p.reason ? ` — ${String(p.reason)}` : "";
      return `Assign shipment ${shortRef(p.shipmentId)} to driver ${shortRef(p.driverId)}${tail}`;
    }
    case "send_customer_notification": {
      const channel = p.channel ? String(p.channel) : "email";
      const tpl = p.templateKey ? String(p.templateKey).replaceAll("_", " ") : "status update";
      return `Send ${channel} notification to customer for shipment ${shortRef(p.shipmentId)} (${tpl})`;
    }
    case "flag_sla_risk": {
      const level = p.riskLevel ? String(p.riskLevel) : "MEDIUM";
      const tail = p.reason ? ` — ${String(p.reason)}` : "";
      return `Flag shipment ${shortRef(p.shipmentId)} as ${level} SLA risk${tail}`;
    }
    case "get_shipment_details":
      return `Look up shipment ${shortRef(p.shipmentId)}`;
    case "get_available_drivers":
      return p.originPostcode
        ? `Look up available drivers near ${String(p.originPostcode)}`
        : "Look up available drivers";
    case "get_carrier_rates":
      return `Look up carrier rates from ${String(p.originPostcode)} to ${String(p.destPostcode)}`;
    default:
      if (action.type.startsWith("get_")) {
        return `Look up ${action.type.slice(4).replaceAll("_", " ")}`;
      }
      return actionTitle(action);
  }
}
