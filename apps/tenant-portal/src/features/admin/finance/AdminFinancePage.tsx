import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Download, Plus } from 'lucide-react';
import { api } from '../../../lib/api';
import { PageSpinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Button } from '../../../components/ui/Button';
import { InvoiceStatusBadge } from '../../../components/ui/StatusBadge';
import { StatCard } from '../../../components/ui/StatCard';
import { formatCurrency, formatDate } from '@fauward/formatting';
import { useAuthStore } from '../../../stores/auth.store';

export function AdminFinancePage() {
  const tenant = useAuthStore(s => s.tenant);
  const qc = useQueryClient();
  const currency = tenant?.defaultCurrency ?? 'GBP';

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get('/finance/invoices').then(r => r.data)
  });

  const { data: summary } = useQuery({
    queryKey: ['finance-summary'],
    queryFn: () => api.get('/finance/summary').then(r => r.data)
  });

  const { mutate: sendInvoice, isPending: sending } = useMutation({
    mutationFn: (id: string) => api.post(`/finance/invoices/${id}/send`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] })
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Finance</h1>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />}>New invoice</Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total invoiced" value={formatCurrency(summary.totalInvoiced ?? 0, currency)} />
          <StatCard label="Collected" value={formatCurrency(summary.collected ?? 0, currency)} />
          <StatCard label="Outstanding" value={formatCurrency(summary.outstanding ?? 0, currency)} />
          <StatCard label="Overdue" value={formatCurrency(summary.overdue ?? 0, currency)} />
        </div>
      )}

      {!invoices?.length
        ? <EmptyState icon="invoice" title="No invoices yet"
            description="Invoices are created automatically when a shipment is delivered, or you can create one manually." />
        : (
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface-0)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-50)]">
                  {['Invoice', 'Customer', 'Amount', 'Status', 'Due', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {invoices.map((inv: any) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-mono text-sm font-medium">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {inv.customer?.firstName} {inv.customer?.lastName ?? inv.customer?.email}
                    </td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(inv.total, currency)}</td>
                    <td className="px-4 py-3"><InvoiceStatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                      {inv.dueDate ? formatDate(inv.dueDate) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {inv.status === 'DRAFT' && (
                          <button title="Send invoice"
                            onClick={() => sendInvoice(inv.id)}
                            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-100)] hover:text-[var(--color-primary-base)]">
                            <Send className="h-4 w-4" />
                          </button>
                        )}
                        <a href={`/api/v1/finance/invoices/${inv.id}/pdf`} target="_blank"
                          className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-100)] hover:text-[var(--color-primary-base)]">
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}
