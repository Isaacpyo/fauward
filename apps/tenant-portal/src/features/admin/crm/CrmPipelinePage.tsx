import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { PageSpinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

const STAGES = ['PROSPECT', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST'];

export function CrmPipelinePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-leads'],
    queryFn: () => api.get('/crm/leads').then(r => r.data)
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">CRM Pipeline</h1>
        <Button variant="primary">New lead</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {STAGES.map(stage => (
          <div key={stage} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)]">
            <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)]">
              {stage}
            </div>
            <div className="space-y-2 p-3">
              {(data?.leads ?? []).filter((l: any) => l.stage === stage).map((lead: any) => (
                <div key={lead.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-50)] p-3">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{lead.company ?? 'Unnamed'}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{lead.contactName ?? lead.email}</p>
                  <div className="mt-2">
                    <Badge variant={stage === 'WON' ? 'success' : stage === 'LOST' ? 'danger' : 'neutral'}>{stage}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}