import { ConsoleApiErrorPanel } from "./ConsoleApiErrorPanel";

/** Full-page error for the console shell (5xx / network on /auth/me). Never treated as "access denied". */
export function ConsoleErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-50)] p-4">
      <div className="w-full max-w-md space-y-3">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">The console could not load your session</h1>
        <p className="text-sm text-[var(--color-text-muted)]">This is a server or network problem, not a permissions problem. Retry, or check the API status.</p>
        <ConsoleApiErrorPanel error={error} onRetry={onRetry} title="Session check failed" />
      </div>
    </div>
  );
}
