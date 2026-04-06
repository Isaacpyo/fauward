import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

type CurrencyRate = {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  source: string;
  fetchedAt: string;
};

export function CurrencyRatesPage() {
  const queryClient = useQueryClient();
  const [fromCurrency, setFromCurrency] = useState("GBP");
  const [toCurrency, setToCurrency] = useState("USD");
  const [rate, setRate] = useState("1.25");

  const ratesQuery = useQuery({
    queryKey: ["pricing-currency-rates"],
    queryFn: async () => (await api.get<{ rates: CurrencyRate[] }>("/v1/pricing/currency-rates")).data.rates
  });

  const overrideMutation = useMutation({
    mutationFn: async () => {
      await api.post("/v1/pricing/currency-rates", {
        fromCurrency,
        toCurrency,
        rate: Number(rate)
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pricing-currency-rates"] });
    }
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await api.post("/v1/pricing/currency-rates/refresh");
    }
  });

  const rates = ratesQuery.data ?? [];

  return (
    <PricingSectionPage title="Currency Rates" description="Manual overrides and refresh of exchange rates used for cross-currency quote display.">
      <div className="grid gap-3 md:grid-cols-4">
        <Input value={fromCurrency} onChange={(event) => setFromCurrency(event.target.value.toUpperCase())} placeholder="From currency" />
        <Input value={toCurrency} onChange={(event) => setToCurrency(event.target.value.toUpperCase())} placeholder="To currency" />
        <Input value={rate} onChange={(event) => setRate(event.target.value)} placeholder="Rate" />
        <Button onClick={() => overrideMutation.mutate()}>Manual override</Button>
      </div>

      <Button variant="secondary" onClick={() => refreshMutation.mutate()}>
        Refresh all (06:00 UTC schedule)
      </Button>

      <Table columns={["From", "To", "Rate", "Source", "Updated"]}>
        {rates.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.fromCurrency}</TableCell>
            <TableCell>{item.toCurrency}</TableCell>
            <TableCell>{Number(item.rate).toFixed(6)}</TableCell>
            <TableCell>{item.source}</TableCell>
            <TableCell>{new Date(item.fetchedAt).toLocaleString()}</TableCell>
          </TableRow>
        ))}
      </Table>
    </PricingSectionPage>
  );
}

