import { Search, Save } from 'lucide-react';
import { cn } from './cn.js';

export type FilterFacet = {
  id: string;
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
};

type FilterBarProps = {
  search?: string;
  onSearchChange?: (value: string) => void;
  facets?: FilterFacet[];
  onFacetChange?: (id: string, value: string) => void;
  onSaveView?: () => void;
  className?: string;
};

export function FilterBar({ search, onSearchChange, facets = [], onFacetChange, onSaveView, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 border border-[var(--color-border)] bg-white p-3 dark:bg-neutral-950', className)}>
      <div className="relative min-w-56 flex-1">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden />
        <input
          value={search ?? ''}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder="Search"
          className="h-9 w-full rounded-md border border-[var(--color-border)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--fauward-navy)] dark:bg-neutral-900"
        />
      </div>
      {facets.map((facet) => (
        <label key={facet.id} className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
          {facet.label}
          <select
            value={facet.value}
            onChange={(event) => onFacetChange?.(facet.id, event.target.value)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-white px-2 text-sm font-normal text-[var(--color-text-primary)] dark:bg-neutral-900"
          >
            {facet.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      ))}
      {onSaveView ? (
        <button type="button" onClick={onSaveView} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold">
          <Save size={14} aria-hidden />
          Save view
        </button>
      ) : null}
    </div>
  );
}
