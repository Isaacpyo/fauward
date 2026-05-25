import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  Clock,
  Flag,
  Package,
  Truck,
  XCircle
} from "lucide-react";

import { useAgentActions, useApproveAgentAction, useRejectAgentAction, type AgentAction } from "@/api/agent-actions";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageShell } from "@/layouts/PageShell";

const TOOL_ICONS: Record<string, React.ElementType> = {
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

function toolTitle(type: string) {
  const spaced = type.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function shortId(id: unknown): string {
  return `${String(id).slice(0, 8)}…`;
}

function formatPayloadSummary(action: AgentAction): string {
  const p = action.payload;

  switch (action.type) {
    case "reroute_shipment": {
      const tail = p.reason ? ` — ${String(p.reason)}` : "";
      return `Reroute shipment ${shortId(p.shipmentId)} to driver ${shortId(p.newDriverId)}${tail}`;
    }
    case "assign_shipment": {
      const tail = p.reason ? ` — ${String(p.reason)}` : "";
      return `Assign shipment ${shortId(p.shipmentId)} to driver ${shortId(p.driverId)}${tail}`;
    }
    case "send_customer_notification": {
      const channel = p.channel ? String(p.channel) : "email";
      const tpl = p.templateKey ? String(p.templateKey).replaceAll("_", " ") : "status update";
      return `Send ${channel} notification to customer for shipment ${shortId(p.shipmentId)} (${tpl})`;
    }
    case "flag_sla_risk": {
      const level = p.riskLevel ? String(p.riskLevel) : "MEDIUM";
      const tail = p.reason ? ` — ${String(p.reason)}` : "";
      return `Flag shipment ${shortId(p.shipmentId)} as ${level} SLA risk${tail}`;
    }
    case "get_shipment_details":
      return `Look up shipment ${shortId(p.shipmentId)}`;
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
      return toolTitle(action.type);
  }
}

const STATUS_CONFIG: Record<
  AgentAction["status"],
  { variant: "warning" | "success" | "error" | "neutral"; icon: React.ElementType; label: string }
> = {
  PENDING_APPROVAL: { variant: "warning", icon: Clock, label: "Pending" },
  AUTO_APPLIED: { variant: "success", icon: CheckCircle2, label: "Auto-applied" },
  APPLIED: { variant: "success", icon: CheckCircle2, label: "Applied" },
  REJECTED: { variant: "error", icon: XCircle, label: "Rejected" },
  FAILED: { variant: "error", icon: AlertTriangle, label: "Failed" }
};

function StatusBadge({ status }: { status: AgentAction["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? { variant: "neutral" as const, icon: Clock, label: status };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1">
      <Icon size={12} />
      {cfg.label}
    </Badge>
  );
}

export function AgentActionsPage() {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useAgentActions("PENDING_APPROVAL", 1, 50);
  const approve = useApproveAgentAction();
  const reject = useRejectAgentAction();

  const pendingActions = data?.items ?? [];

  async function handleApprove(id: string) {
    setConfirmId(null);
    await approve.mutateAsync(id);
  }

  async function handleReject(id: string) {
    await reject.mutateAsync(id);
  }

  return (
    <PageShell title="Agent Actions" description="Review and approve actions proposed by Fauward Agent.">
      <div className="space-y-4">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">Failed to load agent actions.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {!isLoading && !error && pendingActions.length === 0 && (
          <EmptyState
            icon={CheckCircle2}
            title="No actions waiting for your approval"
            description="Fauward Agent will flag anything that needs your decision here — failed deliveries, risky reroutes, customer notifications."
          />
        )}

        {!isLoading && pendingActions.length > 0 && (
          <div className="space-y-3">
            {pendingActions.map((action) => {
              const ToolIcon = TOOL_ICONS[action.type] ?? Bot;
              const approving = approve.isPending && confirmId === action.id;
              return (
                <div
                  key={action.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500">
                        <ToolIcon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900">{toolTitle(action.type)}</h3>
                          <StatusBadge status={action.status} />
                        </div>
                        <p className="mt-1.5 text-sm text-gray-600">{formatPayloadSummary(action)}</p>
                        <p className="mt-2 text-xs text-gray-400">
                          Proposed {new Date(action.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReject(action.id)}
                        disabled={reject.isPending || approve.isPending}
                        loading={reject.isPending}
                        leftIcon={<XCircle className="h-4 w-4" />}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setConfirmId(action.id)}
                        disabled={approve.isPending || reject.isPending}
                        loading={approving}
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(confirmId)}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title="Approve this action?"
        description="This will execute the agent's proposed action immediately. It cannot be undone."
      >
        <div className="py-2">
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmId && handleApprove(confirmId)}
              disabled={approve.isPending}
              loading={approve.isPending}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Approve
            </Button>
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}
