import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";

import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/useAppStore";

type SearchResult = {
  id: string;
  label: string;
  subtitle: string;
  href: string;
  type: "shipment" | "customer" | "invoice";
};

async function runSearch(query: string): Promise<SearchResult[]> {
  if (!query.trim()) {
    return [];
  }
  const response = await api.get<SearchResult[]>("/search", {
    params: { q: query }
  });
  return response.data;
}

const fallbackResults: SearchResult[] = [
  { id: "trk-1001", label: "TRK-1001", subtitle: "Shipment", href: "/shipments/TRK-1001", type: "shipment" },
  { id: "cus-acme", label: "Acme Wholesale", subtitle: "Customer", href: "/crm/cus-acme", type: "customer" },
  { id: "inv-2001", label: "INV-2001", subtitle: "Invoice", href: "/finance/INV-2001", type: "invoice" }
];

export function CommandPalette() {
  const open = useAppStore((state) => state.commandPaletteOpen);
  const setOpen = useAppStore((state) => state.setCommandPaletteOpen);

  const [query, setQuery] = useState("");

  const searchQuery = useQuery({
    queryKey: ["global-search", query],
    queryFn: () => runSearch(query),
    enabled: query.trim().length > 1,
    staleTime: 20_000,
    retry: 1
  });

  const results = useMemo(() => {
    if (searchQuery.isError && query.trim().length > 0) {
      return fallbackResults.filter((result) =>
        result.label.toLowerCase().includes(query.toLowerCase())
      );
    }
    return searchQuery.data ?? [];
  }, [query, searchQuery.data, searchQuery.isError]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
      title="Global search"
      description="Search shipments by tracking number, customers by name, and invoices by number."
    >
      <div className="space-y-4">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search shipments, customers, invoices..."
          className="h-12"
        />

        <div className="max-h-[340px] overflow-y-auto rounded-lg border border-gray-200">
          {query.trim().length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Type at least 2 characters to search.</div>
          ) : null}

          {searchQuery.isLoading ? (
            <div className="p-4 text-sm text-gray-500">Searching...</div>
          ) : null}

          {query.trim().length > 1 && results.length === 0 && !searchQuery.isLoading ? (
            <div className="p-4 text-sm text-gray-500">No results found.</div>
          ) : null}

          <ul>
            {results.map((result) => (
              <li key={result.id}>
                <Link
                  to={result.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className="rounded-md bg-gray-100 p-2 text-gray-500">
                    <Search size={14} />
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">{result.label}</p>
                    <p className="text-xs text-gray-500">{result.subtitle}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
