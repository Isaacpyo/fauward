import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

type InsuranceTier = {
  key: string;
  label: string;
  description: string;
  type: "NONE" | "PERCENT_OF_DECLARED" | "FLAT_FEE";
  rate?: number;
  minFee?: number;
  maxCover?: number;
  enabled: boolean;
};

const defaultTiers: InsuranceTier[] = [
  { key: "NONE", label: "No Insurance", description: "Carrier liability only", type: "NONE", enabled: true },
  { key: "BASIC", label: "Basic Cover", description: "Up to £250", type: "PERCENT_OF_DECLARED", rate: 1.5, minFee: 2, maxCover: 250, enabled: true },
  { key: "STANDARD", label: "Standard Cover", description: "Up to £1,000", type: "PERCENT_OF_DECLARED", rate: 2.5, minFee: 5, maxCover: 1000, enabled: true },
  { key: "PREMIUM", label: "Premium Cover", description: "Up to £5,000", type: "PERCENT_OF_DECLARED", rate: 3.5, minFee: 15, maxCover: 5000, enabled: false }
];

export function InsurancePage() {
  const [tiers, setTiers] = useState<InsuranceTier[]>(defaultTiers);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.patch("/v1/pricing/insurance", { tiers });
    }
  });

  return (
    <PricingSectionPage title="Insurance Tiers" description="Define insurance tiers, formulas, and preview costs by declared value.">
      <div className="grid gap-4 md:grid-cols-2">
        {tiers.map((tier, index) => (
          <div key={tier.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{tier.key}</p>
              <Switch
                checked={tier.enabled}
                onCheckedChange={(checked) =>
                  setTiers((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, enabled: checked } : item)))
                }
              />
            </div>
            <Input
              className="mt-2"
              value={tier.label}
              onChange={(event) =>
                setTiers((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)))
              }
              placeholder="Label"
            />
            <Input
              className="mt-2"
              value={tier.description}
              onChange={(event) =>
                setTiers((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, description: event.target.value } : item)))
              }
              placeholder="Description"
            />
            <Select
              value={tier.type}
              onValueChange={(value) =>
                setTiers((prev) =>
                  prev.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, type: value as InsuranceTier["type"] } : item
                  )
                )
              }
              options={[
                { label: "NONE", value: "NONE" },
                { label: "PERCENT_OF_DECLARED", value: "PERCENT_OF_DECLARED" },
                { label: "FLAT_FEE", value: "FLAT_FEE" }
              ]}
              className="mt-2"
            />
          </div>
        ))}
      </div>
      <Button onClick={() => saveMutation.mutate()}>Save insurance config</Button>
    </PricingSectionPage>
  );
}

