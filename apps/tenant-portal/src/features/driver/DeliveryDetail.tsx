import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, MapPin, PenLine } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { ShipmentStatusBadge } from '../../components/ui/StatusBadge';
import { getAllowedTransitions } from '@fauward/domain-types';
import type { ShipmentStatus } from '@fauward/domain-types';

const STATUS_ACTION_LABEL: Partial<Record<ShipmentStatus, string>> = {
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'Mark in transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Mark delivered',
  FAILED_DELIVERY: 'Failed delivery'
};

export function DeliveryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: shipment, isLoading } = useQuery({
    queryKey: ['shipment', id],
    queryFn: () => api.get(`/shipments/${id}`).then(r => r.data),
    enabled: !!id
  });

  const { mutate: updateStatus, isPending } = useMutation({
    mutationFn: (status: ShipmentStatus) =>
      api.patch(`/shipments/${id}/status`, { status }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment', id] });
      qc.invalidateQueries({ queryKey: ['driver-route'] });
    }
  });

  if (isLoading || !shipment) return <PageSpinner />;

  const dest = shipment.destinationAddress;
  const allowed = getAllowedTransitions(shipment.status);
  const needsPod = shipment.status === 'OUT_FOR_DELIVERY';

  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(
    `${dest.line1}, ${dest.city}`
  )}`;

  return (
    <div className="flex flex-col">
      <div className="bg-[var(--color-surface-0)] border-b border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="text-sm text-[var(--color-primary-base)]">Back</button>
          <ShipmentStatusBadge status={shipment.status} />
        </div>
        <p className="mt-2 font-mono text-sm font-medium text-[var(--color-text-muted)]">
          {shipment.trackingNumber}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Delivery address
          </p>
          <p className="text-base font-medium text-[var(--color-text-primary)]">{dest.line1}</p>
          {dest.line2 && <p className="text-sm text-[var(--color-text-secondary)]">{dest.line2}</p>}
          <p className="text-sm text-[var(--color-text-secondary)]">{dest.city}, {dest.state}</p>
          {shipment.specialInstructions && (
            <p className="mt-2 text-sm text-[var(--status-warning-text)] bg-[var(--status-warning-bg)] rounded-lg px-3 py-2">
              Warning: {shipment.specialInstructions}
            </p>
          )}
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="mt-3 flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary-base)]">
            <MapPin className="h-4 w-4" /> Open in Maps
          </a>
        </div>

        {shipment.customer?.phone && (
          <a href={`tel:${shipment.customer.phone}`}
            className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4 hover:bg-[var(--color-surface-50)]">
            <Phone className="h-5 w-5 text-[var(--color-primary-base)]" />
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Call customer</p>
              <p className="text-xs text-[var(--color-text-muted)]">{shipment.customer.phone}</p>
            </div>
          </a>
        )}

        {shipment.notes && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4">
            <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Notes</p>
            <p className="text-sm text-[var(--color-text-primary)]">{shipment.notes}</p>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-0)] p-4 space-y-2">
        {needsPod && (
          <Button variant="primary" size="lg" className="w-full"
            icon={<PenLine className="h-5 w-5" />}
            onClick={() => navigate(`/driver/${id}/pod`)}>
            Capture proof of delivery
          </Button>
        )}
        {allowed.filter(s => s !== 'EXCEPTION' && s !== 'CANCELLED').map(status => (
          <Button key={status}
            variant={status === 'FAILED_DELIVERY' ? 'destructive' : 'secondary'}
            size="lg" className="w-full" loading={isPending}
            onClick={() => updateStatus(status)}>
            {STATUS_ACTION_LABEL[status] ?? status.replace(/_/g, ' ')}
          </Button>
        ))}
      </div>
    </div>
  );
}
