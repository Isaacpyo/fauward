import { toConsoleApiError } from "@/lib/console-api-error";

/** Inline rendering of a failed console query: status, code and the missing permission — never an empty table. */
export function ConsoleApiErrorPanel({ error, onRetry, title = "Unable to load" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const normalised = toConsoleApiError(error);
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{normalised.message}</p>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-red-700">
        <div className="flex gap-1">
          <dt>status</dt>
          <dd data-testid="console-error-status">{normalised.status === 0 ? "network" : normalised.status}</dd>
        </div>
        <div className="flex gap-1">
          <dt>code</dt>
          <dd data-testid="console-error-code">{normalised.code}</dd>
        </div>
        {normalised.permission ? (
          <div className="flex gap-1">
            <dt>requires</dt>
            <dd data-testid="console-error-permission">{normalised.permission}</dd>
          </div>
        ) : null}
        {normalised.vendor ? (
          <div className="flex gap-1">
            <dt>vendor</dt>
            <dd>{normalised.vendor}</dd>
          </div>
        ) : null}
      </dl>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
          Retry
        </button>
      ) : null}
    </div>
  );
}
