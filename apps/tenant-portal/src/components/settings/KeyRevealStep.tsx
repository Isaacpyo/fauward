import { AlertTriangle, Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

type KeyRevealStepProps = {
  fullKey: string;
  onDone: () => void;
};

export function KeyRevealStep({ fullKey, onDone }: KeyRevealStepProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(fullKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={16} />
          This is the only time this key will be shown. Copy it now.
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="break-all font-mono text-sm text-gray-900">{fullKey}</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={handleCopy} leftIcon={copied ? <Check size={16} /> : <Copy size={16} />}>
          {copied ? "Copied!" : "Copy"}
        </Button>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I've saved this key
        </label>
      </div>

      <div className="flex justify-end">
        <Button onClick={onDone} disabled={!confirmed}>
          Done
        </Button>
      </div>
    </div>
  );
}

