import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import { api } from "@/lib/api";
import type { ShipmentListItem } from "@/types/shipment";
import type { ShipmentState } from "@/types/domain";

type ShipmentTableProps = {
  shipments: ShipmentListItem[];
  selectedIds: string[];
  onToggleSelect: (id: string, value: boolean) => void;
  onToggleSelectAll: (value: boolean) => void;
};

type DriverOption = {
  id: string;
  user: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
};

const transitionMap: Record<ShipmentState, ShipmentState[]> = {
  PENDING: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT", "EXCEPTION", "FAILED_DELIVERY"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "EXCEPTION", "FAILED_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED_DELIVERY", "EXCEPTION"],
  DELIVERED: ["RETURNED"],
  FAILED_DELIVERY: ["OUT_FOR_DELIVERY", "RETURNED", "EXCEPTION"],
  RETURNED: [],
  CANCELLED: [],
  EXCEPTION: ["PROCESSING", "OUT_FOR_DELIVERY", "FAILED_DELIVERY"]
};

async function fetchDrivers() {
  const response = await api.get<{ drivers: DriverOption[] }>("/v1/fleet/drivers");
  return response.data.drivers;
}

export function ShipmentTable({ shipments, selectedIds, onToggleSelect, onToggleSelectAll }: ShipmentTableProps) {
  const navigate = useNavigate();
  const tenant = useTenantStore((state) => state.tenant);
  const allSelected = shipments.length > 0 && selectedIds.length === shipments.length;
  const queryClient = useQueryClient();

  const [activeShipment, setActiveShipment] = useState<ShipmentListItem | null>(null);
  const [nextStatus, setNextStatus] = useState<ShipmentState | "">("");
  const [failedReason, setFailedReason] = useState("");
  const [podRecipient, setPodRecipient] = useState("");
  const [podPhotoUrl, setPodPhotoUrl] = useState("");
  const [driverToAssign, setDriverToAssign] = useState("");

  const driversQuery = useQuery({
    queryKey: ["fleet-drivers-options"],
    queryFn: fetchDrivers
  });
  const drivers = driversQuery.data ?? [];

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!activeShipment || !nextStatus) return;
      await api.patch(`/v1/shipments/${activeShipment.id}/status`, {
        status: nextStatus,
        reason: nextStatus === "FAILED_DELIVERY" ? failedReason : undefined,
        notes:
          nextStatus === "DELIVERED" && podRecipient
            ? `Delivered to ${podRecipient}${podPhotoUrl ? ` | POD photo: ${podPhotoUrl}` : ""}`
            : undefined
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shipments-list"] }),
        queryClient.invalidateQueries({ queryKey: ["shipment-detail", activeShipment?.id] })
      ]);
      setActiveShipment(null);
      setNextStatus("");
      setFailedReason("");
      setPodRecipient("");
      setPodPhotoUrl("");
    }
  });

  const assignMutation = useMutation({
    mutationFn: async ({ shipmentId, driverId }: { shipmentId: string; driverId: string }) => {
      await api.patch(`/v1/shipments/${shipmentId}/assign-driver`, { driverId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
      setDriverToAssign("");
    }
  });

  const allowedNextStates = useMemo(
    () => (activeShipment ? transitionMap[activeShipment.status] ?? [] : []),
    [activeShipment]
  );

  return (
    <>
      <Table
        columns={[
          "",
          "Tracking #",
          "Status",
          "Customer",
          "Origin -> Destination",
          "Driver",
          "Service",
          "Created",
          "Actions"
        ]}
      >
        <TableRow>
          <TableCell>
            <input type="checkbox" checked={allSelected} onChange={(event) => onToggleSelectAll(event.target.checked)} />
          </TableCell>
          <TableCell colSpan={8} className="text-xs text-gray-500">
            Select all visible shipments
          </TableCell>
        </TableRow>

        {shipments.map((shipment) => {
          const selected = selectedIds.includes(shipment.id);
          const canAssignInline = shipment.status === "PROCESSING" && !shipment.driver_name;
          return (
            <TableRow key={shipment.id} selected={selected} onClick={() => navigate(`/shipments/${shipment.id}`)}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={selected}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => onToggleSelect(shipment.id, event.target.checked)}
                />
              </TableCell>
              <TableCell className="font-mono">
                <Link className="text-[var(--tenant-primary)] hover:underline" to={`/shipments/${shipment.id}`} onClick={(event) => event.stopPropagation()}>
                  {shipment.tracking_number}
                </Link>
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveShipment(shipment);
                    setNextStatus("");
                  }}
                >
                  <StatusBadge status={shipment.status} />
                </button>
              </TableCell>
              <TableCell>{shipment.customer_name}</TableCell>
              <TableCell>
                {shipment.origin} {"->"} {shipment.destination}
              </TableCell>
              <TableCell>
                {canAssignInline ? (
                  <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                    <Select
                      value={driverToAssign}
                      onValueChange={setDriverToAssign}
                      options={[
                        { label: "Assign driver", value: "" },
                        ...drivers.map((driver) => ({
                          label:
                            [driver.user.firstName, driver.user.lastName].filter(Boolean).join(" ") ||
                            driver.user.email,
                          value: driver.id
                        }))
                      ]}
                      className="min-w-[170px]"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!driverToAssign}
                      onClick={() => assignMutation.mutate({ shipmentId: shipment.id, driverId: driverToAssign })}
                    >
                      Assign
                    </Button>
                  </div>
                ) : (
                  shipment.driver_name ?? "Unassigned"
                )}
              </TableCell>
              <TableCell>{shipment.service_tier}</TableCell>
              <TableCell>{formatDateTime(shipment.created_at, tenant)}</TableCell>
              <TableCell>
                <Dropdown
                  trigger={
                    <button className="rounded-md border border-gray-300 p-2 hover:bg-gray-50" onClick={(event) => event.stopPropagation()}>
                      <MoreHorizontal size={14} />
                    </button>
                  }
                  items={[
                    { key: "open", label: "View detail", onSelect: () => navigate(`/shipments/${shipment.id}`) },
                    {
                      key: "status",
                      label: "Quick update status",
                      onSelect: () => {
                        setActiveShipment(shipment);
                        setNextStatus("");
                      }
                    },
                    { key: "label", label: "Print label" }
                  ]}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </Table>

      <Dialog
        open={Boolean(activeShipment)}
        onOpenChange={(open) => !open && setActiveShipment(null)}
        title={activeShipment ? `Quick Update · ${activeShipment.tracking_number}` : "Quick Update"}
      >
        <div className="space-y-3">
          <Select
            value={nextStatus}
            onValueChange={(value) => setNextStatus(value as ShipmentState)}
            options={[
              { label: "Select next status", value: "" },
              ...allowedNextStates.map((status) => ({ label: status, value: status }))
            ]}
          />

          {nextStatus === "DELIVERED" ? (
            <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-700">Mini POD capture</p>
              <Input value={podRecipient} onChange={(event) => setPodRecipient(event.target.value)} placeholder="Recipient name" />
              <Input value={podPhotoUrl} onChange={(event) => setPodPhotoUrl(event.target.value)} placeholder="Photo URL (or upload in detail page)" />
            </div>
          ) : null}

          {nextStatus === "FAILED_DELIVERY" ? (
            <Select
              value={failedReason}
              onValueChange={setFailedReason}
              options={[
                { label: "Select failure reason", value: "" },
                { label: "Recipient unavailable", value: "Recipient unavailable" },
                { label: "Incorrect address", value: "Incorrect address" },
                { label: "Access restricted", value: "Access restricted" },
                { label: "Vehicle issue", value: "Vehicle issue" },
                { label: "Other", value: "Other" }
              ]}
            />
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setActiveShipment(null)}>
              Cancel
            </Button>
            <Button disabled={!nextStatus} onClick={() => statusMutation.mutate()}>
              Confirm update
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

