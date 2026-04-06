import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { PlanGate } from '../../../router/guards/PlanGate';
import { formatDateTime } from '@fauward/formatting';

export function WebhooksTab() {
  return (
    <PlanGate plans={['PRO', 'ENTERPRISE']} mode="upgrade"
      message="Webhooks require the Pro plan">
      <WebhooksContent />
    </PlanGate>
  );
}

function WebhooksContent() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);

  const { data: endpoints } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/tenant/webhooks').then(r => r.data)
  });

  const { data: deliveries } = useQuery({
    queryKey: ['webhook-deliveries'],
    queryFn: () => api.get('/tenant/webhooks/deliveries').then(r => r.data)
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => api.post('/tenant/webhooks', { url, events }),
    onSuccess: () => {
      setUrl('');
      setEvents([]);
      qc.invalidateQueries({ queryKey: ['webhooks'] });
    }
  });

  const toggleEvent = (e: string) => {
    setEvents((prev) => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">New webhook</h3>
        <div className="mt-3 space-y-3">
          <Input placeholder="https://example.com/webhooks" value={url} onChange={e => setUrl(e.target.value)} />
          <div className="flex flex-wrap gap-2 text-xs">
            {['shipment.created','shipment.updated','shipment.delivered','invoice.paid'].map(ev => (
              <button key={ev} onClick={() => toggleEvent(ev)}
                className={`rounded-full border px-3 py-1 ${events.includes(ev) ? 'bg-[var(--color-primary-light)] text-[var(--color-primary-base)]' : 'bg-[var(--color-surface-50)] text-[var(--color-text-muted)]'}`}>
                {ev}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={() => save()} loading={isPending}>Save</Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface-0)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-50)]">
              {['URL','Events','Status','Created'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {endpoints?.map((w: any) => (
              <tr key={w.id}>
                <td className="px-4 py-3 text-xs text-[var(--color-text-primary)]">{w.url}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{(w.events ?? []).join(', ')}</td>
                <td className="px-4 py-3"><Badge variant={w.isActive ? 'success' : 'neutral'}>{w.isActive ? 'Active' : 'Disabled'}</Badge></td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{formatDateTime(w.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface-0)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-50)]">
              {['Event','Status','Latency','Time'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {deliveries?.map((d: any) => (
              <tr key={d.id}>
                <td className="px-4 py-3 text-xs text-[var(--color-text-primary)]">{d.eventType}</td>
                <td className="px-4 py-3"><Badge variant={d.status === 'DELIVERED' ? 'success' : d.status === 'FAILED' ? 'danger' : 'neutral'}>{d.status}</Badge></td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{d.durationMs ?? '-'} ms</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{formatDateTime(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}