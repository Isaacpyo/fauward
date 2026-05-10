import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type RateOption = {
  carrier: string;
  serviceLevel: string;
  price: number;
  currency: string;
  transitDays?: number;
  isFastest?: boolean;
  isPreferred?: boolean;
  surcharges?: Array<{ label: string; amount: number }>;
};

type QuoteResponse = {
  id?: string;
  rateQuoteId?: string;
  expiresAt: string;
  quotes: RateOption[];
};

export function RatesPage() {
  const [form, setForm] = useState({
    originCountry: "GB",
    originCity: "London",
    destinationCountry: "NG",
    destinationCity: "Lagos",
    destinationLandmark: "Main gate near market",
    weightKg: "5",
    lengthCm: "40",
    widthCm: "30",
    heightCm: "20",
    serviceType: "STANDARD"
  });
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [selected, setSelected] = useState<RateOption | null>(null);

  const quoteMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<QuoteResponse>("/v1/tenant/rates/quote", {
        origin: { country: form.originCountry, city: form.originCity },
        destination: {
          country: form.destinationCountry,
          city: form.destinationCity,
          landmark: form.destinationLandmark
        },
        weightKg: Number(form.weightKg),
        dimensions: {
          lengthCm: Number(form.lengthCm),
          widthCm: Number(form.widthCm),
          heightCm: Number(form.heightCm)
        },
        serviceType: form.serviceType
      });
      return response.data;
    },
    onSuccess: (data) => {
      setQuote(data);
      setSelected(null);
    }
  });

  const cheapest = useMemo(() => Math.min(...(quote?.quotes ?? []).map((item) => item.price)), [quote]);
  const fastest = useMemo(() => Math.min(...(quote?.quotes ?? []).map((item) => item.transitDays ?? 9999)), [quote]);
  const expired = quote ? new Date(quote.expiresAt).getTime() <= Date.now() : false;

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <PageShell title="Rates" description="Compare carrier options before confirming a booking.">
      <div className="space-y-5">
        <form
          className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            quoteMutation.mutate();
          }}
        >
          <Input value={form.originCountry} onChange={(event) => update("originCountry", event.target.value.toUpperCase())} placeholder="Origin country" />
          <Input value={form.originCity} onChange={(event) => update("originCity", event.target.value)} placeholder="Origin city" />
          <Input value={form.destinationCountry} onChange={(event) => update("destinationCountry", event.target.value.toUpperCase())} placeholder="Destination country" />
          <Input value={form.destinationCity} onChange={(event) => update("destinationCity", event.target.value)} placeholder="Destination city" />
          <Input className="md:col-span-2" value={form.destinationLandmark} onChange={(event) => update("destinationLandmark", event.target.value)} placeholder="Landmark or delivery notes" />
          <Input type="number" min="0" step="0.1" value={form.weightKg} onChange={(event) => update("weightKg", event.target.value)} placeholder="Weight kg" />
          <Select
            value={form.serviceType}
            onValueChange={(value) => update("serviceType", value)}
            options={[
              { label: "Standard", value: "STANDARD" },
              { label: "Express", value: "EXPRESS" },
              { label: "Economy", value: "ECONOMY" }
            ]}
          />
          <Input type="number" min="0" value={form.lengthCm} onChange={(event) => update("lengthCm", event.target.value)} placeholder="Length cm" />
          <Input type="number" min="0" value={form.widthCm} onChange={(event) => update("widthCm", event.target.value)} placeholder="Width cm" />
          <Input type="number" min="0" value={form.heightCm} onChange={(event) => update("heightCm", event.target.value)} placeholder="Height cm" />
          <Button type="submit" loading={quoteMutation.isPending} icon={<RefreshCw size={16} />}>Get quote</Button>
        </form>

        {expired ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Quote expired. Refresh rates before selecting a carrier.
          </div>
        ) : null}

        <Table columns={["Carrier", "Service level", "Price", "Transit days", "Surcharges", "Select"]}>
          {(quote?.quotes ?? []).map((row) => {
            const isCheapest = row.price === cheapest;
            const isFastest = row.isFastest || row.transitDays === fastest;
            return (
              <TableRow key={`${row.carrier}-${row.serviceLevel}`} selected={selected === row}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{row.carrier}</span>
                    {row.isPreferred ? <Badge variant="primary">Preferred</Badge> : null}
                    {isCheapest ? <Badge variant="success">Cheapest</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>{row.serviceLevel}</TableCell>
                <TableCell>{row.price.toFixed(2)} {row.currency}</TableCell>
                <TableCell>{isFastest ? <Badge variant="info">{row.transitDays ?? "N/A"} days</Badge> : row.transitDays ?? "N/A"}</TableCell>
                <TableCell>{row.surcharges?.map((item) => `${item.label}: ${item.amount}`).join(", ") || "None"}</TableCell>
                <TableCell>
                  <Button size="sm" variant={selected === row ? "secondary" : "primary"} disabled={expired} onClick={() => setSelected(row)} icon={selected === row ? <Check size={14} /> : undefined}>
                    Select
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </Table>

        {selected && quote ? (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Selected quote <span className="font-mono">{quote.rateQuoteId ?? quote.id}</span> for {selected.carrier} {selected.serviceLevel}.
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
