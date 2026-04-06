import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Copy, Eye, EyeOff } from 'lucide-react';
import { api } from '../../../../lib/api';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Badge } from '../../../../components/ui/Badge';
import { PlanGate } from '../../../../router/guards/PlanGate';
import { formatDateTime, formatRelative } from '@fauward/formatting';

export function ApiKeysTab() {
  return (
    <PlanGate plans={['PRO', 'ENTERPRISE']} mode="upgrade"
      message="API access requires the Pro plan">
      <ApiKeysContent />
    </PlanGate>
  );
}

function ApiKeysContent() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: keys } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/tenant/api-keys').then(r => r.data)
  });

  const { mutate: generate, isPending: generating } = useMutation({
    mutationFn: () => api.post('/tenant/api-keys', { name: name.trim() }).then(r => r.data),
    onSuccess: (data) => {
      setNewKey(data.key);
      setName('');
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    }
  });

  const { mutate: revoke } = useMutation({
    mutationFn: (id: string) => api.delete(`/tenant/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] })
  });

  const copyKey = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl space-y-6">
      {newKey && (
        <div className="rounded-xl border-2 border-[var(--fauward-amber-light)] bg-[var(--fauward-amber-light)] p-5">
          <p className="mb-1 text-sm font-semibold text-[var(--status-warning-text)]">Warning: Copy this key now</p>
          <p className="mb-3 text-xs text-[var(--status-warning-text)]">This key will not be shown again after you leave this page.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-white px-3 py-2 font-mono text-sm border border-[var(--fauward-amber-light)]">
              {keyVisible ? newKey : '*'.repeat(Math.min(newKey.length, 48))}
            </code>
            <button onClick={() => setKeyVisible(v => !v)}
              className="rounded-lg border border-[var(--fauward-amber-light)] bg-white p-2 hover:bg-[var(--fauward-amber-light)]">
              {keyVisible ? <EyeOff className="h-4 w-4 text-[var(--status-warning-text)]" /> : <Eye className="h-4 w-4 text-[var(--status-warning-text)]" />}
            </button>
            <button onClick={copyKey}
              className="rounded-lg border border-[var(--fauward-amber-light)] bg-white p-2 hover:bg-[var(--fauward-amber-light)]">
              <Copy className="h-4 w-4 text-[var(--status-warning-text)]" />
            </button>
          </div>
          {copied && <p className="mt-1 text-xs font-medium text-green-600">Copied!</p>}
          <button onClick={() => setNewKey(null)} className="mt-3 text-xs text-[var(--status-warning-text)] underline">
            I've copied it - dismiss
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Key name (e.g. WooCommerce integration)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && generate()}
        />
        <Button variant="amber" onClick={() => generate()} loading={generating}>
          <Plus className="h-4 w-4" /> Generate
        </Button>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface-0)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-50)]">
              {['Name', 'Prefix', 'Created', 'Last used', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {keys?.map((k: any) => (
              <tr key={k.id}>
                <td className="px-4 py-3 text-sm text-[var(--color-text-primary)]">{k.name ?? '-'}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">{k.keyPrefix}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{formatDateTime(k.createdAt)}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                  {k.lastUsed ? formatRelative(k.lastUsed) : '-'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={k.isActive ? 'success' : 'neutral'}>{k.isActive ? 'Active' : 'Revoked'}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {k.isActive && (
                    <button onClick={() => revoke(k.id)}
                      className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-100)] hover:text-[var(--color-danger)]">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
