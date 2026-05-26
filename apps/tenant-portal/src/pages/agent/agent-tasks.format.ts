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

// Last 8 chars of a cuid distinguish far better than the first 8 (cuids share a prefix).
function shortId(id: unknown): string {
  const s = String(id ?? "");
  return s.length > 8 ? `#${s.slice(-8)}` : `#${s}`;
}

// Prefer the human-friendly tracking number (rendered in full — they're short and unique).
// Only fall back to the truncated internal cuid when no tracking number is on the payload,
// so two cards for different shipments never look alike at a glance.
function shipmentLabel(p: Record<string, unknown>): string {
  if (p.trackingNumber) return `#${String(p.trackingNumber)}`;
  if (p.shipmentId) {
    const s = String(p.shipmentId);
    // Last 6 chars distinguish far better than the first 8 (cuids share a prefix).
    return `#${s.length > 6 ? s.slice(-6) : s}`;
  }
  return "(unknown)";
}

export function actionSummary(action: AgentAction): string {
  const p = action.payload;

  if (action.type === "flag_finding") {
    const kind = payloadKind(action);
    switch (kind) {
      case "unassigned": {
        const status = p.status ? ` (${String(p.status)})` : "";
        return `Shipment ${shipmentLabel(p)}${status} has no driver assigned`;
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
          ? `Shipment ${shipmentLabel(p)} is past its estimated delivery (${eta})`
          : `Shipment ${shipmentLabel(p)} is past its estimated delivery`;
      }
      case "failed_unhandled": {
        const when = p.failedAt
          ? new Date(String(p.failedAt)).toLocaleDateString()
          : null;
        return when
          ? `Delivery ${shipmentLabel(p)} failed ${when} and hasn't been re-actioned`
          : `Delivery ${shipmentLabel(p)} failed and hasn't been re-actioned`;
      }
      case "stuck":
        return `Shipment ${shipmentLabel(p)} has stalled (open exception case)`;
      default:
        return kind ? `Flagged ${kind.replaceAll("_", " ")}` : "Flagged finding";
    }
  }

  switch (action.type) {
    case "reroute_shipment": {
      const tail = p.reason ? ` — ${String(p.reason)}` : "";
      return `Reroute shipment ${shipmentLabel(p)} to driver ${shortId(p.newDriverId)}${tail}`;
    }
    case "assign_shipment": {
      const tail = p.reason ? ` — ${String(p.reason)}` : "";
      return `Assign shipment ${shipmentLabel(p)} to driver ${shortId(p.driverId)}${tail}`;
    }
    case "send_customer_notification": {
      const channel = p.channel ? String(p.channel) : "email";
      const tpl = p.templateKey ? String(p.templateKey).replaceAll("_", " ") : "status update";
      return `Send ${channel} notification to customer for shipment ${shipmentLabel(p)} (${tpl})`;
    }
    case "flag_sla_risk": {
      const level = p.riskLevel ? String(p.riskLevel) : "MEDIUM";
      const tail = p.reason ? ` — ${String(p.reason)}` : "";
      return `Flag shipment ${shipmentLabel(p)} as ${level} SLA risk${tail}`;
    }
    case "get_shipment_details":
      return `Look up shipment ${shipmentLabel(p)}`;
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
