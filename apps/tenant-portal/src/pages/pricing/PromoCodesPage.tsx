import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

type PromoCode = {
  id: string;
  code: string;
  type: string;
  value: number;
  minOrderValue?: number | null;
  usedCount: number;
  maxUses?: number | null;
  expiresAt?: string | null;
  isEnabled: boolean;
};

export function PromoCodesPage() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [type, setType] = useState("PERCENT_OFF");
  const [value, setValue] = useState("10");

  const query = useQuery({
    queryKey: ["pricing-promo-codes"],
    queryFn: async () => (await api.get<{ promoCodes: PromoCode[] }>("/v1/pricing/promo-codes")).data.promoCodes
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/v1/pricing/promo-codes", {
        code: code.toUpperCase(),
        type,
        value: Number(value)
      });
    },
    onSuccess: async () => {
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["pricing-promo-codes"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/pricing/promo-codes/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pricing-promo-codes"] });
    }
  });

  const rows = query.data ?? [];

  return (
    <PricingSectionPage title="Promo Codes" description="Create and manage promotional discounts and customer restrictions.">
      <div className="grid gap-3 md:grid-cols-4">
        <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Code" />
        <Select
          value={type}
          onValueChange={setType}
          options={[
            { label: "PERCENT_OFF", value: "PERCENT_OFF" },
            { label: "FIXED_OFF", value: "FIXED_OFF" },
            { label: "FREE_INSURANCE", value: "FREE_INSURANCE" },
            { label: "FREE_EXPRESS", value: "FREE_EXPRESS" }
          ]}
        />
        <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Value" />
        <Button onClick={() => createMutation.mutate()}>New Code</Button>
      </div>

      <Table columns={["Code", "Type", "Value", "Used/Max", "Expiry", "Enabled", "Actions"]}>
        {rows.map((promo) => (
          <TableRow key={promo.id}>
            <TableCell className="font-mono">{promo.code}</TableCell>
            <TableCell>{promo.type}</TableCell>
            <TableCell>{Number(promo.value).toFixed(2)}</TableCell>
            <TableCell>
              {promo.usedCount} / {promo.maxUses ?? "∞"}
            </TableCell>
            <TableCell>{promo.expiresAt ? new Date(promo.expiresAt).toLocaleDateString() : "No expiry"}</TableCell>
            <TableCell>{promo.isEnabled ? "Yes" : "No"}</TableCell>
            <TableCell>
              <Button variant="secondary" size="sm" onClick={() => deleteMutation.mutate(promo.id)}>
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </Table>
    </PricingSectionPage>
  );
}

