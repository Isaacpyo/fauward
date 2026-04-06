import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

type RateCard = {
  id: string;
  name?: string | null;
  originZoneId?: string | null;
  destZoneId?: string | null;
  serviceTier?: string | null;
  basePrice: number;
  pricePerKg: number;
  currency: string;
  isActive: boolean;
};

type Zone = { id: string; name: string };

export function RateCardsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("grid");
  const [csv, setCsv] = useState("origin_zone,dest_zone,service_tier,base_fee,per_kg_rate");

  const zonesQuery = useQuery({
    queryKey: ["pricing-zones-basic"],
    queryFn: async () => (await api.get<{ zones: Zone[] }>("/v1/pricing/zones")).data.zones
  });

  const cardsQuery = useQuery({
    queryKey: ["pricing-rate-cards"],
    queryFn: async () => (await api.get<{ rateCards: RateCard[] }>("/v1/pricing/rate-cards")).data.rateCards
  });

  const matrixQuery = useQuery({
    queryKey: ["pricing-rate-card-matrix"],
    queryFn: async () =>
      (await api.get<{ zones: Zone[]; matrix: Record<string, Record<string, RateCard | null>> }>("/v1/pricing/rate-cards/matrix")).data
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      await api.post("/v1/pricing/rate-cards/matrix/import", { csv });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pricing-rate-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["pricing-rate-card-matrix"] })
      ]);
    }
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/v1/pricing/rate-cards/${id}/activate`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pricing-rate-cards"] });
    }
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/v1/pricing/rate-cards/${id}/duplicate`, {
        effectiveFrom: new Date().toISOString(),
        name: "Duplicated rate card"
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pricing-rate-cards"] });
    }
  });

  const zones = zonesQuery.data ?? [];
  const cards = cardsQuery.data ?? [];
  const matrix = matrixQuery.data?.matrix ?? {};

  const zoneNameById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone.name])), [zones]);

  return (
    <PricingSectionPage title="Rate Cards" description="Manage list and matrix views of zone-to-zone rates, tiers, and activation windows.">
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "grid", label: "Grid view" },
          { value: "list", label: "List view" }
        ]}
      >
        <TabsContent value="grid">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-2 py-2 text-left">Origin \\ Destination</th>
                  {zones.map((zone) => (
                    <th key={zone.id} className="border border-gray-200 px-2 py-2 text-left">{zone.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.map((origin) => (
                  <tr key={origin.id}>
                    <td className="border border-gray-200 px-2 py-2 font-medium">{origin.name}</td>
                    {zones.map((dest) => {
                      const cell = matrix[origin.id]?.[dest.id];
                      return (
                        <td key={dest.id} className="border border-gray-200 px-2 py-2">
                          {cell ? `${cell.serviceTier ?? "STANDARD"} · ${Number(cell.basePrice).toFixed(2)}` : "+ Add rate"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="list">
          <Table columns={["Name", "Origin", "Destination", "Tier", "Base", "Per KG", "Active", "Actions"]}>
            {cards.map((card) => (
              <TableRow key={card.id}>
                <TableCell>{card.name ?? "Rate card"}</TableCell>
                <TableCell>{zoneNameById.get(card.originZoneId ?? "") ?? "N/A"}</TableCell>
                <TableCell>{zoneNameById.get(card.destZoneId ?? "") ?? "N/A"}</TableCell>
                <TableCell>{card.serviceTier ?? "STANDARD"}</TableCell>
                <TableCell>{Number(card.basePrice).toFixed(2)}</TableCell>
                <TableCell>{Number(card.pricePerKg).toFixed(2)}</TableCell>
                <TableCell>{card.isActive ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => activateMutation.mutate(card.id)}>
                      Activate
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => duplicateMutation.mutate(card.id)}>
                      Duplicate
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        </TabsContent>
      </Tabs>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm font-medium text-gray-900">Import from CSV</p>
        <Input value={csv} onChange={(event) => setCsv(event.target.value)} className="mt-2" />
        <Button variant="secondary" className="mt-2" onClick={() => importMutation.mutate()}>
          Import CSV
        </Button>
      </div>
    </PricingSectionPage>
  );
}

