import { Copy, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import type { DomainStatusResponse } from "@/api/domain";
import { Button } from "@/components/ui/Button";
import { DomainStatusBadge } from "./DomainStatusBadge";

type DnsInstructionsCardProps = {
  data: DomainStatusResponse;
  stage: "dns" | "ssl";
  onRefresh: () => void;
  isRefreshing: boolean;
};

async function copy(value: string, onCopied: () => void) {
  await navigator.clipboard.writeText(value);
  onCopied();
}

export function DnsInstructionsCard({ data, stage, onRefresh, isRefreshing }: DnsInstructionsCardProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const records = data.records?.length ? data.records : data.instructions ? [data.instructions] : [];
  const hasTxtVerification = records.some((record) => record.type.toUpperCase() === "TXT");

  function copiedValue(value: string) {
    setCopied(value);
    window.setTimeout(() => setCopied(null), 1400);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{data.domain}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              {stage === "dns" || hasTxtVerification
                ? `Add ${records.length > 1 ? "these DNS records" : "this DNS record"} with your DNS provider. Fauward will keep checking the Vercel verification status.`
                : "DNS is pointing at Vercel. SSL is being verified before traffic is routed to this domain."}
            </p>
          </div>
          <DomainStatusBadge status={data.status} />
        </div>

        {records.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-lg border border-gray-200">
            <div className="grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              <span>Type</span>
              <span>Name / Host</span>
              <span>Value / Target</span>
            </div>
            {records.map((record) => (
              <div
                key={`${record.type}:${record.host}:${record.value}`}
                className="grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b border-gray-100 px-4 py-3 text-sm text-gray-800 last:border-b-0"
              >
                <code>{record.type}</code>
                <RecordName record={record} copied={copied} onCopy={copiedValue} />
                <CodeWithCopy value={record.value} copied={copied === record.value} onCopy={copiedValue} />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={onRefresh} disabled={isRefreshing} leftIcon={<RefreshCw size={16} />}>
          {isRefreshing ? "Checking..." : "Check now"}
        </Button>
        {data.status === "PENDING_DNS" || data.status === "VERIFYING" ? (
          <span className="inline-flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking every 10 seconds
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RecordName({
  record,
  copied,
  onCopy
}: {
  record: { name: string; host: string };
  copied: string | null;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <CodeWithCopy value={record.name} copied={copied === record.name} onCopy={onCopy} />
      {record.host !== record.name ? <p className="mt-1 break-all text-xs text-gray-500">{record.host}</p> : null}
    </div>
  );
}

function CodeWithCopy({
  value,
  copied,
  onCopy
}: {
  value: string;
  copied: boolean;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="break-all text-xs sm:text-sm">{value}</code>
      <button
        type="button"
        onClick={() => void copy(value, () => onCopy(value))}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 hover:bg-gray-50"
        aria-label={`Copy ${value}`}
      >
        <Copy size={14} />
      </button>
      {copied ? <span className="text-xs font-semibold text-emerald-700">Copied</span> : null}
    </div>
  );
}
