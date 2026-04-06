import type { WebhookSendTestResult } from "./types";

type SendTestResultProps = {
  result: WebhookSendTestResult;
};

export function SendTestResult({ result }: SendTestResultProps) {
  const statusTone =
    result.statusCode >= 500 ? "text-red-700 bg-red-50 border-red-200" : result.statusCode >= 400 ? "text-amber-800 bg-amber-50 border-amber-200" : "text-green-700 bg-green-50 border-green-200";

  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${statusTone}`}>
      <p className="font-mono">
        {result.ok ? "SUCCESS" : "FAILED"} {result.statusCode} ({result.latencyMs}ms)
      </p>
      {result.responsePreview ? <p className="mt-1 truncate">{result.responsePreview}</p> : null}
    </div>
  );
}

