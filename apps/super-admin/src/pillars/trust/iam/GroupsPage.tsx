import { EmptyState } from "@fauward/internal-ui";

export function GroupsPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Staff groups</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Team groupings for Support, Finance, Engineering and Security.</p>
      </header>
      <EmptyState title="Groups are not configured yet" message="Phase 1 stores roles directly on staff users. Group sync arrives with SSO directory integration." />
    </div>
  );
}
