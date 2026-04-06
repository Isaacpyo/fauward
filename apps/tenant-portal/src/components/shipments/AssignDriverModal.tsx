import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { DriverListItem } from "@/types/shipment";

type AssignDriverModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drivers: DriverListItem[];
  currentDriverId?: string;
  currentDriverName?: string;
  onConfirm: (driverId: string) => Promise<void>;
};

export function AssignDriverModal({
  open,
  onOpenChange,
  drivers,
  currentDriverId,
  currentDriverName,
  onConfirm
}: AssignDriverModalProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filteredDrivers = useMemo(
    () =>
      drivers.filter((driver) =>
        driver.name.toLowerCase().includes(query.toLowerCase())
      ),
    [drivers, query]
  );

  const selectedDriver = filteredDrivers.find((driver) => driver.id === selectedId);

  const confirm = async () => {
    if (!selectedId) {
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(selectedId);
      onOpenChange(false);
      setSelectedId(null);
      setQuery("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign driver"
      description="Select a driver and confirm assignment."
    >
      <div className="space-y-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search drivers..."
          className="pl-10"
        />
        <Search size={16} className="pointer-events-none -mt-[43px] ml-3 text-gray-400" />

        <div className="max-h-[260px] space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2">
          {filteredDrivers.map((driver) => (
            <button
              key={driver.id}
              type="button"
              onClick={() => setSelectedId(driver.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left",
                selectedId === driver.id
                  ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-light)]"
                  : "border-gray-200 hover:bg-gray-50"
              )}
            >
              <div className="flex items-center gap-3">
                <Avatar src={driver.avatar_url} fallback={driver.name} className="h-9 w-9" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{driver.name}</p>
                  <p className="text-xs text-gray-500">{driver.current_load} active shipments</p>
                </div>
              </div>
              <Badge
                variant={
                  driver.status === "available"
                    ? "success"
                    : driver.status === "busy"
                      ? "warning"
                      : "neutral"
                }
              >
                {driver.status}
              </Badge>
            </button>
          ))}
        </div>

        {currentDriverId && selectedDriver && selectedDriver.id !== currentDriverId ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This shipment is currently assigned to {currentDriverName ?? "a driver"}. Reassign?
          </div>
        ) : null}

        <Button onClick={confirm} loading={submitting} disabled={!selectedId || submitting} className="w-full">
          Confirm assignment
        </Button>
      </div>
    </Dialog>
  );
}
