import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";

import { KeyRevealStep } from "./KeyRevealStep";
import type { ApiKeyScope } from "./types";
import { API_KEY_SCOPES } from "./types";

type GenerateKeyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (payload: { name: string; scopes: ApiKeyScope[] }) => Promise<{ fullKey: string }>;
};

export function GenerateKeyModal({ open, onOpenChange, onGenerate }: GenerateKeyModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState("");
  const [fullKey, setFullKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setName("");
      setScopes([]);
      setNameError("");
      setFullKey(null);
      setIsSubmitting(false);
    }
  }, [open]);

  const canGenerate = useMemo(() => name.trim().length > 1 && scopes.length > 0, [name, scopes.length]);

  function toggleScope(scope: ApiKeyScope) {
    setScopes((previous) => (previous.includes(scope) ? previous.filter((item) => item !== scope) : [...previous, scope]));
  }

  async function handleGenerate() {
    if (!canGenerate) {
      if (name.trim().length <= 1) {
        setNameError("Name is required");
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onGenerate({ name: name.trim(), scopes });
      setFullKey(result.fullKey);
      setStep(2);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={step === 1 ? "Generate New API Key" : "API Key Generated"}
      description={step === 1 ? "Set a key name and select scopes for access control." : "Copy and securely store this key before closing."}
    >
      {step === 1 ? (
        <div className="space-y-4">
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (event.target.value.trim().length > 1) {
                setNameError("");
              }
            }}
            placeholder="Production Backend"
            error={nameError || undefined}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-gray-800">Scopes</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex min-h-[44px] items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="font-mono text-xs">{scope}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleGenerate} disabled={!canGenerate} loading={isSubmitting}>
              Generate Key
            </Button>
          </div>
        </div>
      ) : fullKey ? (
        <KeyRevealStep fullKey={fullKey} onDone={() => onOpenChange(false)} />
      ) : null}
    </Dialog>
  );
}
