import type { AuditEntry } from '../types.js';
import { AuditEntryRow } from './AuditEntryRow.js';

type AuditTimelineProps = {
  entries: AuditEntry[];
  onShowDiff?: (entry: AuditEntry) => void;
};

export function AuditTimeline({ entries, onShowDiff }: AuditTimelineProps) {
  if (entries.length === 0) {
    return <div className="rounded-md border border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-text-muted)]">No audit entries found.</div>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
      {entries.map((entry) => (
        <AuditEntryRow key={entry.id} entry={entry} onShowDiff={onShowDiff} />
      ))}
    </div>
  );
}
