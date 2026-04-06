import { Badge } from './Badge';

export function ShipmentStatusBadge({ status }: { status: string }) {
  const normalized = status?.toUpperCase();
  const variant =
    normalized === 'DELIVERED' || normalized === 'ACTIVE'
      ? 'success'
      : normalized === 'FAILED_DELIVERY' || normalized === 'OVERDUE' || normalized === 'SUSPENDED'
        ? 'danger'
        : normalized === 'OUT_FOR_DELIVERY'
          ? 'warning'
          : normalized === 'PROCESSING' || normalized === 'IN_TRANSIT'
            ? 'info'
            : normalized === 'CANCELLED' || normalized === 'RETURNED' || normalized === 'VOID'
              ? 'neutral'
              : 'neutral';

  return <Badge variant={variant as any}>{normalized}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  return <ShipmentStatusBadge status={status} />;
}