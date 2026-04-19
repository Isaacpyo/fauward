import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type ReturnItem = {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
  shipment: {
    trackingNumber: string;
  };
  customer: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
};

const fallbackReturns: ReturnItem[] = [
  {
    id: "ret-1",
    status: "REQUESTED",
    reason: "Wrong item received",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
    shipment: { trackingNumber: "FWD-2026-10451" },
    customer: { firstName: "Sarah", lastName: "Cole", email: "sarah@atlasretail.com" }
  },
  {
    id: "ret-2",
    status: "LABEL_ISSUED",
    reason: "Damaged packaging",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    shipment: { trackingNumber: "FWD-2026-10432" },
    customer: { firstName: "Kunle", lastName: "Adebayo", email: "kunle@northline.com" }
  }
];

async function fetchReturns(status?: string): Promise<ReturnItem[]> {
  const query = status && status !== "all" ? `?status=${status}` : "";
  const response = await api.get<{ data: ReturnItem[] }>(`/v1/returns${query}`);
  return response.data.data;
}

export function ReturnsListPage() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useQuery({
    queryKey: ["returns", status],
    queryFn: () => fetchReturns(status),
    refetchInterval: 60_000
  });

  const items = query.data ?? fallbackReturns;
  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const customerName =
        [item.customer.firstName, item.customer.lastName].filter(Boolean).join(" ").toLowerCase() ||
        item.customer.email.toLowerCase();
      return (
        item.shipment.trackingNumber.toLowerCase().includes(needle) ||
        customerName.includes(needle) ||
        item.reason.toLowerCase().includes(needle)
      );
    });
  }, [items, debouncedSearch]);

  return (
    <PageShell
      title="Returns"
      description="Reverse logistics requests and processing pipeline."
      actions={
        <Button asChild>
          <Link to="/shipments">Start a return</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Start a return from a shipment record, then track approval, label issue, pickup, warehouse receipt, and refund from here.
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr,220px]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by tracking number, customer, or reason..."
          />
          <Select
            value={status}
            onValueChange={setStatus}
            options={[
              { label: "All statuses", value: "all" },
              { label: "Requested", value: "REQUESTED" },
              { label: "Approved", value: "APPROVED" },
              { label: "Label issued", value: "LABEL_ISSUED" },
              { label: "Picked up", value: "PICKED_UP" },
              { label: "In hub", value: "IN_HUB" },
              { label: "Received", value: "RECEIVED" },
              { label: "Refunded", value: "REFUNDED" },
              { label: "Resolved", value: "RESOLVED" },
              { label: "Rejected", value: "REJECTED" }
            ]}
          />
        </div>

        <Table columns={["Tracking #", "Customer", "Reason", "Status", "Created", "Actions"]}>
          {filtered.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-mono">{item.shipment.trackingNumber}</TableCell>
              <TableCell>
                {[item.customer.firstName, item.customer.lastName].filter(Boolean).join(" ") || item.customer.email}
              </TableCell>
              <TableCell>{item.reason}</TableCell>
              <TableCell>
                <Badge variant="neutral">{item.status}</Badge>
              </TableCell>
              <TableCell>{new Date(item.createdAt).toLocaleString()}</TableCell>
              <TableCell>
                <Link to={`/returns/${item.id}`} className="text-[var(--tenant-primary)] hover:underline">
                  View detail
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </div>
    </PageShell>
  );
}
