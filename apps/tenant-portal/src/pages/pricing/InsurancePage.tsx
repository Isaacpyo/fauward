import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { PricingSectionPage } from "./PricingSectionPage";
import { ErrorState } from "@/components/shared/ErrorState";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";

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

/** Starting point offered when the workspace has never saved tiers; amounts are in the workspace currency. */
const suggestedTiers: InsuranceTier[] = [
  { key: "NONE", label: "No Insurance", description: "Carrier liability only", type: "NONE", enabled: true },
  { key: "BASIC", label: "Basic Cover", description: "Low-value parcels", type: "PERCENT_OF_DECLARED", rate: 1.5, minFee: 2, maxCover: 250, enabled: true },
  { key: "STANDARD", label: "Standard Cover", description: "Typical parcels", type: "PERCENT_OF_DECLARED", rate: 2.5, minFee: 5, maxCover: 1000, enabled: true },
  { key: "PREMIUM", label: "Premium Cover", description: "High-value parcels", type: "PERCENT_OF_DECLARED", rate: 3.5, minFee: 15, maxCover: 5000, enabled: false }
];

export function InsurancePage() {
  const queryClient = useQueryClient();
  const [tiers, setTiers] = useState<InsuranceTier[] | null>(null);

  const savedQuery = useQuery({
    queryKey: ["pricing-insurance"],
    queryFn: async () => (await api.get<{ configured: boolean; tiers: InsuranceTier[] }>("/v1/pricing/insurance")).data
  });

  useEffect(() => {
    if (savedQuery.data && tiers === null) setTiers(savedQuery.data.configured ? savedQuery.data.tiers : suggestedTiers);
  }, [savedQuery.data, tiers]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.patch("/v1/pricing/insurance", { tiers });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pricing-insurance"] })
  });

  if (savedQuery.isError) {
    return (
      <PricingSectionPage title="Insurance Tiers" description="Define insurance tiers, formulas, and preview costs by declared value.">
        <ErrorState title="Insurance tiers could not be loaded" description={apiErrorMessage(savedQuery.error, "The pricing service returned an error.")} onRetry={() => void savedQuery.refetch()} />
      </PricingSectionPage>
    );
  }
  if (!tiers) {
    return (
      <PricingSectionPage title="Insurance Tiers" description="Define insurance tiers, formulas, and preview costs by declared value.">
        <p className="text-sm text-gray-500">Loading insurance tiers…</p>
      </PricingSectionPage>
    );
  }

  return (
    <PricingSectionPage title="Insurance Tiers" description="Define insurance tiers, formulas, and preview costs by declared value.">
      {savedQuery.data && !savedQuery.data.configured ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No insurance tiers are saved for this workspace yet. These suggested tiers apply only after you save them.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {tiers.map((tier, index) => (
          <div key={tier.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{tier.key}</p>
              <Switch
                checked={tier.enabled}
                onCheckedChange={(checked) =>
                  setTiers((prev) => (prev ?? []).map((item, itemIndex) => (itemIndex === index ? { ...item, enabled: checked } : item)))
                }
              />
            </div>
            <Input
              className="mt-2"
              value={tier.label}
              onChange={(event) =>
                setTiers((prev) => (prev ?? []).map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)))
              }
              placeholder="Label"
            />
            <Input
              className="mt-2"
              value={tier.description}
              onChange={(event) =>
                setTiers((prev) => (prev ?? []).map((item, itemIndex) => (itemIndex === index ? { ...item, description: event.target.value } : item)))
              }
              placeholder="Description"
            />
            <Select
              value={tier.type}
              onValueChange={(value) =>
                setTiers((prev) =>
                  (prev ?? []).map((item, itemIndex) =>
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
      {saveMutation.isError ? (
        <p className="text-sm text-red-700" role="alert">{apiErrorMessage(saveMutation.error, "The tiers were not saved.")}</p>
      ) : null}
      {saveMutation.isSuccess ? <p className="text-sm text-green-700">Insurance tiers saved.</p> : null}
      <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={saveMutation.isPending}>
        Save insurance config
      </Button>
    </PricingSectionPage>
  );
}

