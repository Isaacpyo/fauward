import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

type Zone = {
  id: string;
  name: string;
  zoneType: string;
  description?: string | null;
  rateCardCount?: number;
};

export function ZonesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [zoneType, setZoneType] = useState("NATIONAL");
  const [description, setDescription] = useState("");

  const zonesQuery = useQuery({
    queryKey: ["pricing-zones"],
    queryFn: async () => (await api.get<{ zones: Zone[] }>("/v1/pricing/zones")).data.zones
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/v1/pricing/zones", { name, zoneType, description });
    },
    onSuccess: async () => {
      setName("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["pricing-zones"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/pricing/zones/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pricing-zones"] });
    }
  });

  const zones = zonesQuery.data ?? [];

  return (
    <PricingSectionPage title="Service Zones" description="Define named geographic zones used by rate cards and matrix pricing.">
      <div className="grid gap-3 md:grid-cols-4">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Zone name" />
        <Select
          value={zoneType}
          onValueChange={setZoneType}
          options={[
            { label: "NATIONAL", value: "NATIONAL" },
            { label: "INTERNATIONAL", value: "INTERNATIONAL" },
            { label: "REGIONAL", value: "REGIONAL" }
          ]}
        />
        <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
        <Button onClick={() => createMutation.mutate()}>New Zone</Button>
      </div>

      <Table columns={["Name", "Type", "Rate cards", "Description", "Actions"]}>
        {zones.map((zone) => (
          <TableRow key={zone.id}>
            <TableCell>{zone.name}</TableCell>
            <TableCell>{zone.zoneType}</TableCell>
            <TableCell>{zone.rateCardCount ?? 0}</TableCell>
            <TableCell>{zone.description ?? "N/A"}</TableCell>
            <TableCell>
              <Button variant="secondary" size="sm" onClick={() => deleteMutation.mutate(zone.id)}>
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </Table>
    </PricingSectionPage>
  );
}

