import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, FilterX, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { TenantRouteOption } from "@/lib/route-options";
import type { ShipmentState, TenantRole } from "@/types/domain";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export type ShipmentFilters = {
  search: string;
  statuses: ShipmentState[];
  dateFrom: string;
  dateTo: string;
  driver: string;
  customer: string;
  route: string;
};

type ShipmentFilterBarProps = {
  filters: ShipmentFilters;
  onChange: (filters: ShipmentFilters) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  role?: TenantRole;
  routeOptions?: TenantRouteOption[];
};

const statusOptions: ShipmentState[] = [
  "PENDING",
  "PROCESSING",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED_DELIVERY",
  "RETURNED",
  "CANCELLED",
  "EXCEPTION"
];

const isStaffRole = (role?: TenantRole) =>
  role === "TENANT_ADMIN" || role === "TENANT_MANAGER" || role === "TENANT_STAFF";

export function ShipmentFilterBar({ filters, onChange, onRefresh, isRefreshing, role, routeOptions = [] }: ShipmentFilterBarProps) {
  const showStaffFilters = isStaffRole(role);
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onChange({ ...filters, search: debouncedSearch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const toggleStatus = (status: ShipmentState) => {
    const has = filters.statuses.includes(status);
    onChange({
      ...filters,
      statuses: has
        ? filters.statuses.filter((value) => value !== status)
        : [...filters.statuses, status]
    });
  };

  return (
    <div className="rounded-lg bg-white px-3 py-1.5">
      <div className="flex items-center gap-1.5 overflow-x-auto">

        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search tracking, customer, ref…"
          className="h-7 w-[180px] shrink-0 text-xs"
        />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-7 w-[120px] shrink-0 items-center justify-between rounded-md border border-gray-300 px-2.5 text-xs text-gray-700 whitespace-nowrap",
                filters.statuses.length > 0 ? "border-[var(--tenant-primary)]" : ""
              )}
            >
              <span>{filters.statuses.length ? `${filters.statuses.length} statuses` : "All statuses"}</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={6} className="z-50 w-64 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
              {statusOptions.map((status) => {
                const checked = filters.statuses.includes(status);
                return (
                  <DropdownMenu.CheckboxItem
                    key={status}
                    checked={checked}
                    onCheckedChange={() => toggleStatus(status)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs text-gray-700 outline-none hover:bg-gray-100"
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gray-100">
                      {checked ? <Check size={12} /> : null}
                    </span>
                    {status}
                  </DropdownMenu.CheckboxItem>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })}
          aria-label="From date"
          className="h-7 w-[130px] shrink-0 text-xs"
        />
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(event) => onChange({ ...filters, dateTo: event.target.value })}
          aria-label="To date"
          className="h-7 w-[130px] shrink-0 text-xs"
        />

        {showStaffFilters ? (
          <Select
            value={filters.driver}
            onValueChange={(value) => onChange({ ...filters, driver: value })}
            className="h-7 w-[130px] shrink-0 text-xs"
            options={[
              { label: "All operators", value: "all" },
              { label: "Assigned", value: "assigned" },
              { label: "Unassigned", value: "unassigned" }
            ]}
          />
        ) : null}

        {showStaffFilters ? (
          <Select
            value={filters.customer}
            onValueChange={(value) => onChange({ ...filters, customer: value })}
            className="h-7 w-[130px] shrink-0 text-xs"
            options={[
              { label: "All customers", value: "all" },
              { label: "Acme Retail", value: "acme" },
              { label: "Northline", value: "northline" }
            ]}
          />
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          leftIcon={<FilterX size={13} />}
          className="h-7 shrink-0 whitespace-nowrap text-xs"
          onClick={() =>
            onChange({
              search: "",
              statuses: [],
              dateFrom: "",
              dateTo: "",
              driver: "all",
              customer: "all",
              route: "all"
            })
          }
        >
          Clear filters
        </Button>

        {onRefresh ? (
          <button
            type="button"
            title="Refresh shipments"
            onClick={onRefresh}
            className="inline-flex h-7 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
            disabled={isRefreshing}
          >
            <RotateCw size={13} className={isRefreshing ? "animate-spin" : ""} />
          </button>
        ) : null}

      </div>
    </div>
  );
}
