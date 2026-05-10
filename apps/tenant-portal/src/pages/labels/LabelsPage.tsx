import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, PackageCheck, Printer } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type ShipmentRow = {
  id: string;
  trackingNumber: string;
  reference?: string;
  status: string;
  destinationAddress?: Record<string, unknown>;
  generatedLabels?: Array<{ id: string; format: "PDF" | "ZPL" | "PNG"; url: string }>;
};

export function LabelsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [generated, setGenerated] = useState<Record<string, Array<{ id: string; format: "PDF" | "ZPL" | "PNG"; url: string }>>>({});
  const [bulkDone, setBulkDone] = useState(false);

  const shipmentsQuery = useQuery({
    queryKey: ["label-shipments"],
    queryFn: async () => {
      const response = await api.get<{ data?: ShipmentRow[]; shipments?: ShipmentRow[] }>("/v1/shipments?status=PROCESSING");
      return response.data.data ?? response.data.shipments ?? [];
    }
  });

  const generateLabel = useMutation({
    mutationFn: async ({ shipmentId, format, reprintId }: { shipmentId: string; format: "PDF" | "ZPL" | "PNG"; reprintId?: string }) => {
      const url = reprintId
        ? `/v1/tenant/shipments/${shipmentId}/labels/${reprintId}/reprint`
        : `/v1/tenant/shipments/${shipmentId}/labels`;
      const response = await api.post(url, { format });
      return { shipmentId, label: response.data.label ?? response.data };
    },
    onSuccess: ({ shipmentId, label }) => {
      setGenerated((current) => ({ ...current, [shipmentId]: [...(current[shipmentId] ?? []), label] }));
      if (label.downloadUrl || label.url) window.open(label.downloadUrl ?? label.url, "_blank", "noopener,noreferrer");
    }
  });

  const shipments = shipmentsQuery.data ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return shipments;
    return shipments.filter((shipment) => (
      shipment.trackingNumber?.toLowerCase().includes(needle) ||
      shipment.reference?.toLowerCase().includes(needle) ||
      JSON.stringify(shipment.destinationAddress ?? {}).toLowerCase().includes(needle)
    ));
  }, [shipments, search]);

  async function generateAllSelected() {
    setBulkDone(false);
    for (const shipmentId of selected) {
      await generateLabel.mutateAsync({ shipmentId, format: "PDF" });
    }
    setBulkDone(true);
  }

  function labelsFor(shipment: ShipmentRow) {
    return [...(shipment.generatedLabels ?? []), ...(generated[shipment.id] ?? [])];
  }

  return (
    <PageShell title="Labels" description="Generate, download, reprint, and bulk process shipment labels.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input className="max-w-md" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search confirmed shipments..." />
          <Button variant="secondary" disabled={!selected.length} loading={generateLabel.isPending} onClick={generateAllSelected} icon={<PackageCheck size={16} />}>
            Generate all selected
          </Button>
          {bulkDone ? <Button variant="secondary" icon={<Download size={16} />}>Download all as ZIP</Button> : null}
        </div>

        <Table columns={["Select", "Shipment", "Destination", "Status", "Label status", "Downloads", "Reprint"]}>
          {filtered.map((shipment) => {
            const labels = labelsFor(shipment);
            const pdf = labels.find((label) => label.format === "PDF");
            const zpl = labels.find((label) => label.format === "ZPL");
            const png = labels.find((label) => label.format === "PNG");
            return (
              <TableRow key={shipment.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.includes(shipment.id)}
                    onChange={(event) => setSelected((current) => event.target.checked ? [...current, shipment.id] : current.filter((id) => id !== shipment.id))}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-mono text-gray-900">{shipment.trackingNumber}</div>
                  <div className="text-xs text-gray-500">{shipment.reference ?? shipment.id}</div>
                </TableCell>
                <TableCell>{JSON.stringify(shipment.destinationAddress ?? {})}</TableCell>
                <TableCell>{shipment.status}</TableCell>
                <TableCell>{labels.length ? <Badge variant="success">Generated</Badge> : <Badge variant="neutral">Not generated</Badge>}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => pdf?.url ? window.open(pdf.url, "_blank") : generateLabel.mutate({ shipmentId: shipment.id, format: "PDF" })}>PDF A4/A6</Button>
                    <Button size="sm" variant="secondary" onClick={() => zpl?.url ? window.open(zpl.url, "_blank") : generateLabel.mutate({ shipmentId: shipment.id, format: "ZPL" })}>ZPL</Button>
                    <Button size="sm" variant="secondary" onClick={() => png?.url ? window.open(png.url, "_blank") : generateLabel.mutate({ shipmentId: shipment.id, format: "PNG" })}>PNG</Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="secondary" disabled={!labels.length} icon={<Printer size={14} />} onClick={() => labels[0] && generateLabel.mutate({ shipmentId: shipment.id, format: labels[0].format, reprintId: labels[0].id })}>
                    Reprint
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </Table>
      </div>
    </PageShell>
  );
}
