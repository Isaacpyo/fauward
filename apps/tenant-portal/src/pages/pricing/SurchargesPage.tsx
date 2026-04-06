import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

type Surcharge = {
  id: string;
  name: string;
  condition: string;
  type: string;
  value: number;
  isEnabled: boolean;
};

export function SurchargesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [condition, setCondition] = useState("ALWAYS");
  const [type, setType] = useState("FLAT_FEE");
  const [value, setValue] = useState("0");

  const query = useQuery({
    queryKey: ["pricing-surcharges"],
    queryFn: async () => (await api.get<{ surcharges: Surcharge[] }>("/v1/pricing/surcharges")).data.surcharges
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/v1/pricing/surcharges", {
        name,
        condition,
        type,
        value: Number(value)
      });
    },
    onSuccess: async () => {
      setName("");
      setValue("0");
      await queryClient.invalidateQueries({ queryKey: ["pricing-surcharges"] });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/v1/pricing/surcharges/${id}/toggle`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pricing-surcharges"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/pricing/surcharges/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pricing-surcharges"] });
    }
  });

  const surcharges = query.data ?? [];

  return (
    <PricingSectionPage title="Surcharges" description="Configure conditional surcharge layers and customer visibility rules.">
      <div className="grid gap-3 md:grid-cols-5">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Surcharge name" />
        <Select
          value={condition}
          onValueChange={setCondition}
          options={[
            { label: "ALWAYS", value: "ALWAYS" },
            { label: "OVERSIZE", value: "OVERSIZE" },
            { label: "OVERWEIGHT", value: "OVERWEIGHT" },
            { label: "REMOTE_AREA", value: "REMOTE_AREA" },
            { label: "FUEL", value: "FUEL" },
            { label: "PEAK_SEASON", value: "PEAK_SEASON" }
          ]}
        />
        <Select
          value={type}
          onValueChange={setType}
          options={[
            { label: "FLAT_FEE", value: "FLAT_FEE" },
            { label: "PERCENT_OF_BASE", value: "PERCENT_OF_BASE" },
            { label: "PERCENT_OF_TOTAL", value: "PERCENT_OF_TOTAL" },
            { label: "PER_KG", value: "PER_KG" }
          ]}
        />
        <Input type="number" value={value} onChange={(event) => setValue(event.target.value)} />
        <Button onClick={() => createMutation.mutate()}>New Surcharge</Button>
      </div>

      <Table columns={["Name", "Condition", "Type", "Value", "Enabled", "Actions"]}>
        {surcharges.map((surcharge) => (
          <TableRow key={surcharge.id}>
            <TableCell>{surcharge.name}</TableCell>
            <TableCell>{surcharge.condition}</TableCell>
            <TableCell>{surcharge.type}</TableCell>
            <TableCell>{Number(surcharge.value).toFixed(2)}</TableCell>
            <TableCell>
              <Switch checked={surcharge.isEnabled} onCheckedChange={() => toggleMutation.mutate(surcharge.id)} />
            </TableCell>
            <TableCell>
              <Button variant="secondary" size="sm" onClick={() => deleteMutation.mutate(surcharge.id)}>
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </Table>
    </PricingSectionPage>
  );
}

