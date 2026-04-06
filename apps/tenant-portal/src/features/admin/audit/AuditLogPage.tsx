import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { PageSpinner } from '../../../components/ui/Spinner';
import { formatDateTime } from '@fauward/formatting';

export function AuditLogPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', page],
    queryFn: () => api.get(`/audit-log?page=${page}&limit=50`).then(r => r.data)
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Audit log</h1>

      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface-0)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-50)]">
              {['Time','Actor','Action','Resource','IP'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {data?.events?.map((e: any) => (
              <tr key={e.id} className="hover:bg-[var(--color-surface-50)]">
                <td className="px-4 py-2 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {formatDateTime(e.timestamp)}
                </td>
                <td className="px-4 py-2 text-xs">
                  <span className="font-medium">{e.actor?.email ?? 'System'}</span>
                  <span className="ml-1 text-[var(--color-text-muted)]">({e.actorType})</span>
                </td>
                <td className="px-4 py-2">
                  <code className="rounded bg-[var(--color-surface-100)] px-1.5 py-0.5 text-xs font-mono">
                    {e.action}
                  </code>
                </td>
                <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">
                  {e.resourceType} {e.resourceId && <span className="font-mono">#{e.resourceId.slice(0, 8)}</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-[var(--color-text-muted)]">
                  {e.actorIp ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.totalPages > 1 && (
        <div className="flex justify-end gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-40">
            Previous
          </button>
          <button disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}