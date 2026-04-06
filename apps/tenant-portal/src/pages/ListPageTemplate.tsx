import { CalendarRange, FilterX, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PageShell } from "@/layouts/PageShell";
import { cn } from "@/lib/utils";

export type ListRow = {
  id: string;
  values: Array<string | number>;
  href: string;
};

type ListPageTemplateProps = {
  title: string;
  description: string;
  createLabel: string;
  createTo: string;
  columns: string[];
  rows: ListRow[];
  loading?: boolean;
  emptyTitle: string;
  emptyDescription: string;
};

export function ListPageTemplate({
  title,
  description,
  createLabel,
  createTo,
  columns,
  rows,
  loading = false,
  emptyTitle,
  emptyDescription
}: ListPageTemplateProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState("10");

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const asText = row.values.join(" ").toLowerCase();
      const bySearch = search ? asText.includes(search.toLowerCase()) : true;
      const byStatus =
        statusFilter === "all" ? true : asText.includes(statusFilter.toLowerCase());
      return bySearch && byStatus;
    });
  }, [rows, search, statusFilter]);

  const start = (page - 1) * Number(perPage);
  const end = start + Number(perPage);
  const paginatedRows = filteredRows.slice(start, end);
  const pages = Math.max(1, Math.ceil(filteredRows.length / Number(perPage)));

  return (
    <PageShell
      title={title}
      description={description}
      actions={
        <Button leftIcon={<Plus size={16} />} onClick={() => navigate(createTo)}>
          {createLabel}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="grid gap-3 xl:grid-cols-[220px,220px,1fr,1fr,auto]">
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={[
                { label: "All statuses", value: "all" },
                { label: "Pending", value: "pending" },
                { label: "In transit", value: "in transit" },
                { label: "Delivered", value: "delivered" }
              ]}
            />
            <Select
              value="all-types"
              onValueChange={() => undefined}
              options={[
                { label: "All types", value: "all-types" },
                { label: "Standard", value: "standard" },
                { label: "Express", value: "express" }
              ]}
            />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." />
            <div className="grid grid-cols-[1fr,1fr] gap-2">
              <Input type="date" />
              <Input type="date" />
            </div>
            <Button
              variant="secondary"
              leftIcon={<FilterX size={16} />}
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            >
              Clear
            </Button>
          </div>
        </div>

        {selectedRows.length > 0 ? (
          <div className="sticky top-[calc(var(--topbar-height)+10px)] z-20 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2 shadow-sm">
            <p className="text-sm text-gray-700">{selectedRows.length} selected</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm">
                Export
              </Button>
              <Button variant="danger" size="sm">
                Delete
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState icon={Search} title={emptyTitle} description={emptyDescription} ctaLabel={createLabel} onCtaClick={() => navigate(createTo)} />
        ) : (
          <>
            <Table columns={["", ...columns]}>
              {paginatedRows.map((row) => {
                const selected = selectedRows.includes(row.id);
                return (
                  <TableRow key={row.id} selected={selected} onClick={() => navigate(row.href)}>
                    <TableCell className="w-10" >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          event.stopPropagation();
                          setSelectedRows((current) =>
                            selected
                              ? current.filter((id) => id !== row.id)
                              : [...current, row.id]
                          );
                        }}
                      />
                    </TableCell>
                    {row.values.map((value, index) => (
                      <TableCell key={`${row.id}-${index}`} className={cn(index === 0 ? "font-medium text-gray-900" : "")}>
                        {value}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </Table>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <CalendarRange size={16} className="text-gray-500" />
                <span className="text-sm text-gray-600">Page {page} of {pages}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
                <Select
                  value={perPage}
                  onValueChange={(value) => {
                    setPerPage(value);
                    setPage(1);
                  }}
                  options={[
                    { label: "10 / page", value: "10" },
                    { label: "25 / page", value: "25" },
                    { label: "50 / page", value: "50" }
                  ]}
                  className="w-[130px]"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
