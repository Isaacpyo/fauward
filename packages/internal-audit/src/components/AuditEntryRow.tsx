import { formatDistanceToNow } from 'date-fns';
import type { AuditEntry } from '../types.js';

type AuditEntryRowProps = {
  entry: AuditEntry;
  onShowDiff?: (entry: AuditEntry) => void;
};

export function AuditEntryRow({ entry, onShowDiff }: AuditEntryRowProps) {
  return (
    <div className="grid gap-3 border-b border-[var(--color-border)] bg-white p-3 text-sm dark:bg-neutral-950 md:grid-cols-[1.2fr,1fr,1fr,auto]">
      <div>
        <p className="font-semibold text-[var(--color-text-primary)]">{entry.action}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{formatDistanceToNow(entry.timestamp, { addSuffix: true })}</p>
      </div>
      <div>
        <p className="font-mono text-xs text-[var(--color-text-primary)]">{entry.actor_id}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{entry.actor_role}</p>
      </div>
      <div>
        <p className="font-mono text-xs text-[var(--color-text-primary)]">{entry.target_type}:{entry.target_id}</p>
        {entry.reason ? <p className="text-xs text-[var(--color-text-muted)]">{entry.reason}</p> : null}
      </div>
      <button type="button" onClick={() => onShowDiff?.(entry)} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold">
        Diff
      </button>
    </div>
  );
}
