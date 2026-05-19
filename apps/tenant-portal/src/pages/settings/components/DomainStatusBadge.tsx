import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";

import type { DomainStatus } from "@/api/domain";
import { cn } from "@/lib/utils";

const statusConfig: Record<DomainStatus, { label: string; className: string; icon: typeof Clock3 }> = {
  NONE: {
    label: "Not configured",
    className: "border-gray-200 bg-gray-50 text-gray-600",
    icon: XCircle
  },
  PENDING_DNS: {
    label: "Pending DNS",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    icon: Clock3
  },
  VERIFYING: {
    label: "Verifying SSL",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    icon: Loader2
  },
  ACTIVE: {
    label: "Live",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2
  },
  FAILED: {
    label: "Failed",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: XCircle
  }
};

export function DomainStatusBadge({ status }: { status: DomainStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span
      data-testid="domain-status-badge"
      className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", config.className)}
    >
      <Icon className={cn("h-3.5 w-3.5", status === "VERIFYING" ? "animate-spin" : "")} />
      {config.label}
    </span>
  );
}
