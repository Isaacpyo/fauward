import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { StatCard } from '../../../components/ui/StatCard';
import { PageSpinner } from '../../../components/ui/Spinner';
import { formatCurrency } from '@fauward/formatting';
import { useAuthStore } from '../../../stores/auth.store';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export function AdminAnalyticsPage() {
  const tenant = useAuthStore(s => s.tenant);
  const currency = tenant?.defaultCurrency ?? 'GBP';

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-full'],
    queryFn: () => api.get('/analytics/full').then(r => r.data)
  });

  if (isLoading) return <PageSpinner />;

  const primaryColor = 'var(--color-primary-base)';
  const gridColor = 'var(--color-surface-100)';
  const tickColor = 'var(--color-text-muted)';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Analytics</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total shipments" value={data?.totals?.shipments ?? 0} />
        <StatCard label="Revenue" value={formatCurrency(data?.totals?.revenue ?? 0, currency)} />
        <StatCard label="On-time rate" value={`${data?.totals?.onTimeRate ?? 0}%`} />
        <StatCard label="Avg delivery days" value={data?.totals?.avgDeliveryDays ?? 0} />
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-5">
        <h2 className="mb-4 text-sm font-medium text-[var(--color-text-primary)]">Shipment volume</h2>
        {data?.volumeByDay?.length > 0
          ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.volumeByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickColor }} />
                <YAxis tick={{ fontSize: 11, fill: tickColor }} />
                <Tooltip />
                <Bar dataKey="count" fill={primaryColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )
          : <div className="flex h-40 items-center justify-center text-sm text-[var(--color-text-muted)]">No data yet</div>
        }
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-5">
        <h2 className="mb-4 text-sm font-medium text-[var(--color-text-primary)]">Revenue</h2>
        {data?.revenueByDay?.length > 0
          ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickColor }} />
                <YAxis tick={{ fontSize: 11, fill: tickColor }} tickFormatter={v => `GBP ${v}`} />
                <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
                <Line type="monotone" dataKey="amount" stroke={primaryColor} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )
          : <div className="flex h-40 items-center justify-center text-sm text-[var(--color-text-muted)]">No data yet</div>
        }
      </div>
    </div>
  );
}
