import { Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

type TrackingNumberProps = {
  value: string;
};

export function TrackingNumber({ value }: TrackingNumberProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <code className="rounded-md bg-gray-100 px-2 py-1 font-mono text-sm text-gray-900">{value}</code>
      <Button variant="ghost" size="sm" onClick={copy} leftIcon={<Copy size={14} />}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
