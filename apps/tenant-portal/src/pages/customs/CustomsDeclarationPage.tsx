import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Tooltip } from "@/components/ui/Tooltip";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type Item = { description: string; hsCode: string; quantity: number; value: number; weight: number; origin: string };
type Shipment = { id: string; trackingNumber: string; originAddress?: any; destinationAddress?: any; weightKg?: number; status?: string };
type Declaration = { id: string; type: "DDP" | "DDU"; items: Item[]; totalValue: number; currency: string; status: string; holdReason?: string };

const blankItem: Item = { description: "", hsCode: "", quantity: 1, value: 0, weight: 0, origin: "GB" };

export function CustomsDeclarationPage() {
  const { shipmentId = "" } = useParams();
  const queryClient = useQueryClient();
  const [type, setType] = useState<"DDP" | "DDU">("DDU");
  const [items, setItems] = useState<Item[]>([{ ...blankItem, description: "mobile phone charger" }]);
  const [suggestions, setSuggestions] = useState<Array<{ hsCode: string; description: string; score?: number }>>([]);

  const shipmentQuery = useQuery({
    queryKey: ["shipment", shipmentId],
    queryFn: async () => (await api.get<Shipment>(`/v1/shipments/${shipmentId}`)).data
  });
  const declarationQuery = useQuery({
    queryKey: ["customs-declaration", shipmentId],
    queryFn: async () => (await api.get<Declaration>(`/v1/tenant/shipments/${shipmentId}/customs/declaration`)).data,
    retry: false
  });

  const declaration = declarationQuery.data;
  const shipment = shipmentQuery.data;
  const domestic = shipment && shipment.originAddress?.country && shipment.destinationAddress?.country && shipment.originAddress.country === shipment.destinationAddress.country;
  const readOnly = declaration?.status === "HELD" || declaration?.status === "CLEARED";
  const totalValue = useMemo(() => items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.value || 0), 0), [items]);

  const lookup = useMutation({
    mutationFn: async (description: string) => {
      const response = await api.post("/v1/tenant/customs/hs-lookup", { description });
      return response.data.suggestions ?? response.data;
    },
    onSuccess: setSuggestions
  });

  const save = useMutation({
    mutationFn: async (status: "DRAFT" | "SUBMITTED") => {
      const payload = { type, items, totalValue, currency: "GBP", status };
      if (declaration) return api.put(`/v1/tenant/shipments/${shipmentId}/customs/declaration`, payload);
      return api.post(`/v1/tenant/shipments/${shipmentId}/customs/declaration`, payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customs-declaration", shipmentId] })
  });

  function updateItem(index: number, patch: Partial<Item>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  if (domestic) return <Navigate to={`/shipments/${shipmentId}`} replace />;

  return (
    <PageShell title="Customs declaration" description="Prepare cross-border customs data and HS code classification.">
      <div className="space-y-5">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <div><span className="text-gray-500">Reference</span><div className="font-mono">{shipment?.trackingNumber ?? shipmentId}</div></div>
            <div><span className="text-gray-500">Origin</span><div>{shipment?.originAddress?.city} {shipment?.originAddress?.country}</div></div>
            <div><span className="text-gray-500">Destination</span><div>{shipment?.destinationAddress?.city} {shipment?.destinationAddress?.country}</div></div>
            <div><span className="text-gray-500">Weight</span><div>{shipment?.weightKg ?? 0} kg</div></div>
          </div>
        </div>

        {readOnly ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <Badge variant={declaration.status === "CLEARED" ? "success" : "warning"}>{declaration.status}</Badge>
            {declaration.holdReason ? <p className="mt-3 text-sm text-gray-700">{declaration.holdReason}</p> : null}
          </div>
        ) : (
          <>
            <div className="flex max-w-sm items-center gap-2">
              <Select value={type} onValueChange={(value) => setType(value as "DDP" | "DDU")} options={[{ label: "DDU", value: "DDU" }, { label: "DDP", value: "DDP" }]} />
              <Tooltip content="DDP means the sender pays duties. DDU means the recipient pays duties on arrival.">
                <button className="rounded-md p-2 text-gray-500 hover:bg-gray-100" type="button"><HelpCircle size={16} /></button>
              </Tooltip>
            </div>

            <Table columns={["Description", "HS code", "Quantity", "Unit value", "Weight", "Origin"]}>
              {items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell><Input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} /></TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Input value={item.hsCode} onChange={(event) => updateItem(index, { hsCode: event.target.value })} />
                      <Button size="sm" variant="secondary" icon={<Search size={14} />} onClick={() => lookup.mutate(item.description)}>Search</Button>
                    </div>
                  </TableCell>
                  <TableCell><Input type="number" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} /></TableCell>
                  <TableCell><Input type="number" value={item.value} onChange={(event) => updateItem(index, { value: Number(event.target.value) })} /></TableCell>
                  <TableCell><Input type="number" value={item.weight} onChange={(event) => updateItem(index, { weight: Number(event.target.value) })} /></TableCell>
                  <TableCell><Input value={item.origin} onChange={(event) => updateItem(index, { origin: event.target.value.toUpperCase() })} /></TableCell>
                </TableRow>
              ))}
            </Table>

            {suggestions.length ? (
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                {suggestions.slice(0, 5).map((suggestion) => (
                  <button key={suggestion.hsCode} className="block w-full rounded-md px-3 py-2 text-left hover:bg-gray-50" onClick={() => updateItem(0, { hsCode: suggestion.hsCode })}>
                    {suggestion.hsCode} - {suggestion.description}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-sm text-gray-700">Total declared value: <span className="font-semibold">GBP {totalValue.toFixed(2)}</span></div>
              <div className="flex gap-2">
                <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setItems((current) => [...current, blankItem])}>Add item</Button>
                <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate("DRAFT")}>Save draft</Button>
                <Button loading={save.isPending} onClick={() => save.mutate("SUBMITTED")}>Submit</Button>
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
