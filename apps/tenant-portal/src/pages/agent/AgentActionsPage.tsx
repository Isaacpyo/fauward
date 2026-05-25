import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Clock,
  ChevronRight,
  Package,
  Truck,
  Bell,
  Flag,
  BarChart3
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PageShell } from "@/layouts/PageShell";
import {
  useAgentActions,
  useApproveAgentAction,
  useRejectAgentAction,
  type AgentAction
} from "@/api/agent-actions";

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

function toolLabel(type: string) {
  return type.replaceAll("_", " ");
}

function formatPayloadSummary(action: AgentAction): string {
  const payload = action.payload;
  const parts: string[] = [];

  if (payload.shipmentId) {
    parts.push(`Shipment ${String(payload.shipmentId).slice(0, 8)}…`);
  }
  if (payload.driverId || payload.newDriverId) {
    parts.push(`Driver ${String(payload.driverId ?? payload.newDriverId).slice(0, 8)}…`);
  }
  if (payload.reason) {
    parts.push(String(payload.reason));
  }
  if (payload.channel) {
    parts.push(`${payload.channel} notification`);
  }
  if (payload.templateKey) {
    parts.push(String(payload.templateKey).replaceAll("_", " "));
  }
  if (payload.riskLevel) {
    parts.push(`${payload.riskLevel} risk`);
  }

  if (parts.length === 0) {
    return "Agent proposed action";
  }

  return parts.join(" · ");
}

function StatusBadge({ status }: { status: AgentAction["status"] }) {
  const variants: Record<string, { color: string; icon: React.ElementType; label: string }> = {
    PENDING_APPROVAL: { color: "amber", icon: Clock, label: "Pending" },
    AUTO_APPLIED: { color: "green", icon: CheckCircle2, label: "Auto-applied" },
    APPLIED: { color: "green", icon: CheckCircle2, label: "Applied" },
    REJECTED: { color: "red", icon: XCircle, label: "Rejected" },
    FAILED: { color: "red", icon: AlertTriangle, label: "Failed" }
  };

  const config = variants[status] ?? { color: "gray", icon: Clock, label: status };
  const Icon = config.icon;

  return (
    <Badge
      variant="warning"
      className={`inline-flex items-center gap-1 text-xs font-medium bg-${config.color}-50 text-${config.color}-700`}
    >
      <Icon size={12} />
      {config.label}
    </Badge>
  );
}

export function AgentActionsPage() {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { data, isLoading, error } = useAgentActions("PENDING_APPROVAL", 1, 50);
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
    <PageShell
      title="Agent Actions"
      description="Review and approve actions proposed by Fauward Agent."
    >
      <div className="space-y-6">
        {/* Empty state */}
        {!isLoading && pendingActions.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-gray-900">No actions waiting for approval</h3>
            <p className="mt-1 text-sm text-gray-500">
              The agent will queue risky actions here for your review.
            </p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-gray-100 bg-gray-50"
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">
                Failed to load agent actions. Please try again.
              </p>
            </div>
          </div>
        )}

        {/* Table */}
        {!isLoading && pendingActions.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <Table
              columns={["Action", "Details", "Created", "Status", ""]}
            >
              {pendingActions.map((action) => {
                const ToolIcon = TOOL_ICONS[action.type] ?? Bot;
                return (
                  <TableRow key={action.id}>
                    <TableCell className="w-48">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
                          <ToolIcon size={16} />
                        </div>
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {toolLabel(action.type)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-gray-600">
                        {formatPayloadSummary(action)}
                      </p>
                    </TableCell>
                    <TableCell className="w-40">
                      <span className="text-xs text-gray-500">
                        {new Date(action.createdAt).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="w-32">
                      <StatusBadge status={action.status} />
                    </TableCell>
                    <TableCell className="w-48">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReject(action.id)}
                          disabled={reject.isPending || approve.isPending}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          {reject.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setConfirmId(action.id)}
                          disabled={approve.isPending || reject.isPending}
                        >
                          {approve.isPending && confirmId === action.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Approve
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </Table>
          </div>
        )}
      </div>

      {/* Confirm Approve Dialog */}
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
            >
              {approve.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-4 w-4" />
              )}
              Approve
            </Button>
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}
