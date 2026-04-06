import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

type WeightTier = {
  id: string;
  name?: string | null;
  minWeightKg: number;
  maxWeightKg?: number | null;
  discountType: string;
  discountValue: number;
  isEnabled: boolean;
};

export function WeightTiersPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [minWeight, setMinWeight] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [discountType, setDiscountType] = useState("PERCENT");
  const [discountValue, setDiscountValue] = useState("");
  const [conflictPolicy, setConflictPolicy] = useState("BEST_FOR_CUSTOMER");

  const tiersQuery = useQuery({
    queryKey: ["pricing-weight-tiers"],
    queryFn: async () => (await api.get<{ tiers: WeightTier[] }>("/v1/pricing/weight-tiers")).data.tiers
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/v1/pricing/weight-tiers", {
        name,
        minWeightKg: Number(minWeight),
        maxWeightKg: maxWeight ? Number(maxWeight) : undefined,
        discountType,
        discountValue: Number(discountValue)
      });
    },
    onSuccess: async () => {
      setName("");
      setMinWeight("");
      setMaxWeight("");
      setDiscountValue("");
      await queryClient.invalidateQueries({ queryKey: ["pricing-weight-tiers"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/pricing/weight-tiers/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pricing-weight-tiers"] });
    }
  });

  const savePolicy = useMutation({
    mutationFn: async () => {
      await api.patch("/v1/pricing/settings", { weightTierConflictPolicy: conflictPolicy });
    }
  });

  const tiers = tiersQuery.data ?? [];

  return (
    <PricingSectionPage title="Weight Discount Tiers" description="Configure bulk discount bands and conflict policy for overlapping ranges.">
      <div className="grid gap-3 lg:grid-cols-6">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tier name" />
        <Input value={minWeight} onChange={(event) => setMinWeight(event.target.value)} placeholder="Min kg" />
        <Input value={maxWeight} onChange={(event) => setMaxWeight(event.target.value)} placeholder="Max kg (optional)" />
        <Select
          value={discountType}
          onValueChange={setDiscountType}
          options={[
            { label: "PERCENT", value: "PERCENT" },
            { label: "FLAT_FEE_REDUCTION", value: "FLAT_FEE_REDUCTION" },
            { label: "FIXED_PER_KG_OVERRIDE", value: "FIXED_PER_KG_OVERRIDE" }
          ]}
        />
        <Input value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder="Discount value" />
        <Button onClick={() => createMutation.mutate()}>New Tier</Button>
      </div>

      <Table columns={["Name", "Range", "Type", "Value", "Enabled", "Actions"]}>
        {tiers.map((tier) => (
          <TableRow key={tier.id}>
            <TableCell>{tier.name ?? "Tier"}</TableCell>
            <TableCell>
              {Number(tier.minWeightKg)}kg - {tier.maxWeightKg ? `${Number(tier.maxWeightKg)}kg` : "No max"}
            </TableCell>
            <TableCell>{tier.discountType}</TableCell>
            <TableCell>{Number(tier.discountValue).toFixed(2)}</TableCell>
            <TableCell>{tier.isEnabled ? "Yes" : "No"}</TableCell>
            <TableCell>
              <Button variant="secondary" size="sm" onClick={() => deleteMutation.mutate(tier.id)}>
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </Table>

      <div className="flex items-center gap-2">
        <Select
          value={conflictPolicy}
          onValueChange={setConflictPolicy}
          options={[
            { label: "Best for customer", value: "BEST_FOR_CUSTOMER" },
            { label: "Most specific", value: "MOST_SPECIFIC" },
            { label: "First match", value: "FIRST_MATCH" }
          ]}
          className="w-[240px]"
        />
        <Button variant="secondary" onClick={() => savePolicy.mutate()}>
          Save conflict policy
        </Button>
      </div>
    </PricingSectionPage>
  );
}

