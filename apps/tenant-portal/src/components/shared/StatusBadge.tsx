import type { InvoiceState, ShipmentState } from "@/types/domain";
import { Badge } from "@/components/ui/Badge";

type StatusValue = ShipmentState | InvoiceState;

type StatusBadgeProps = {
  status: StatusValue;
};

const statusVariantMap: Record<StatusValue, "neutral" | "info" | "warning" | "success" | "error"> = {
  PENDING: "neutral",
  PROCESSING: "info",
  PICKED_UP: "info",
  IN_TRANSIT: "warning",
  OUT_FOR_DELIVERY: "warning",
  DELIVERED: "success",
  FAILED_DELIVERY: "error",
  RETURNED: "warning",
  CANCELLED: "neutral",
  EXCEPTION: "error",
  DRAFT: "neutral",
  SENT: "info",
  PAID: "success",
  OVERDUE: "error",
  VOID: "neutral"
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = status.replaceAll("_", " ");
  const variant = statusVariantMap[status];

  return (
    <Badge variant={variant} className={status === "CANCELLED" || status === "VOID" ? "line-through opacity-75" : ""}>
      {label}
    </Badge>
  );
}
