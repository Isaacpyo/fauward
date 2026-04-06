import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { PageSpinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ShipmentStatusBadge } from '../../components/ui/StatusBadge';
import { formatDateTime } from '@fauward/formatting';

export function DriverDashboard() {
  const today = new Date().toISOString().split('T')[0];

  const { data, isLoading } = useQuery({
    queryKey: ['driver-route', today],
    queryFn: () => api.get(`/driver/route?date=${today}`).then(r => r.data),
    refetchInterval: 30000
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="flex h-full flex-col">
      <div className="bg-[var(--color-primary-base)] px-4 py-6 text-white">
        <p className="text-sm opacity-75">Today's route</p>
        <p className="mt-0.5 text-2xl font-semibold">
          {data?.stops?.length ?? 0} stops
        </p>
        <div className="mt-3 flex gap-4 text-sm">
          <span>{data?.pickups ?? 0} pickups</span>
          <span>{data?.deliveries ?? 0} deliveries</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!data?.stops?.length
          ? (
            <EmptyState
              icon="route"
              title="No stops today"
              description="Your route is empty. Check back later."
            />
          )
          : data.stops.map((stop: any, i: number) => (
            <Link key={stop.id} to={`/driver/${stop.shipmentId}`}
              className="flex items-start gap-4 border-b border-[var(--color-border)] p-4 hover:bg-[var(--color-surface-50)] active:bg-[var(--color-surface-100)] transition-colors">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-sm font-semibold text-[var(--color-primary-base)]">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium uppercase tracking-wide ${stop.type === 'PICKUP' ? 'text-[var(--color-info)]' : 'text-[var(--color-success)]'}`}>
                    {stop.type === 'PICKUP' ? 'Pickup' : 'Delivery'}
                  </span>
                  <ShipmentStatusBadge status={stop.shipment.status} />
                </div>
                <p className="mt-0.5 truncate text-sm font-medium text-[var(--color-text-primary)]">
                  {stop.type === 'PICKUP' ? stop.shipment.originAddress.line1 : stop.shipment.destinationAddress.line1}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {stop.type === 'PICKUP'
                    ? `${stop.shipment.originAddress.city}`
                    : `${stop.shipment.destinationAddress.city}`}
                </p>
                {stop.estimatedAt && (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Est. {formatDateTime(stop.estimatedAt)}
                  </p>
                )}
              </div>
              <div className="text-[var(--color-text-muted)]">{">"}</div>
            </Link>
          ))
        }
      </div>
    </div>
  );
}
