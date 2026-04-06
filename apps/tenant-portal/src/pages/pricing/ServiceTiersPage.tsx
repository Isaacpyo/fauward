import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

type Tier = {
  label: string;
  multiplier: number;
  description: string;
  isEnabled: boolean;
};

const defaultTiers: Record<string, Tier> = {
  STANDARD: { label: "Standard", multiplier: 1, description: "3-5 business days", isEnabled: true },
  EXPRESS: { label: "Express", multiplier: 1.6, description: "Next business day", isEnabled: true },
  OVERNIGHT: { label: "Overnight", multiplier: 2.2, description: "By 9am next day", isEnabled: false }
};

export function ServiceTiersPage() {
  const [tiers, setTiers] = useState<Record<string, Tier>>(defaultTiers);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.patch("/v1/pricing/service-tiers", tiers);
    }
  });

  return (
    <PricingSectionPage title="Service Tiers" description="Configure labels, multipliers, descriptions, and visibility of service tiers.">
      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(tiers).map(([key, tier]) => (
          <div key={key} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-500">{key}</p>
            <Input
              className="mt-2"
              value={tier.label}
              onChange={(event) => setTiers((prev) => ({ ...prev, [key]: { ...prev[key], label: event.target.value } }))}
              placeholder="Label"
            />
            <Input
              className="mt-2"
              type="number"
              step="0.01"
              value={tier.multiplier}
              onChange={(event) =>
                setTiers((prev) => ({ ...prev, [key]: { ...prev[key], multiplier: Number(event.target.value) } }))
              }
              placeholder="Multiplier"
            />
            <Input
              className="mt-2"
              value={tier.description}
              onChange={(event) =>
                setTiers((prev) => ({ ...prev, [key]: { ...prev[key], description: event.target.value } }))
              }
              placeholder="Description"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-600">Enabled</span>
              <Switch
                checked={tier.isEnabled}
                onCheckedChange={(checked) => setTiers((prev) => ({ ...prev, [key]: { ...prev[key], isEnabled: checked } }))}
              />
            </div>
            <p className="mt-2 text-xs text-gray-600">Preview: £10 becomes £{(10 * tier.multiplier).toFixed(2)}</p>
          </div>
        ))}
      </div>
      <Button onClick={() => saveMutation.mutate()}>Save all</Button>
    </PricingSectionPage>
  );
}

