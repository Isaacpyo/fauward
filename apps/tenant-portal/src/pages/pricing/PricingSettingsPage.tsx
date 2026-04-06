import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

export function PricingSettingsPage() {
  const [dimensionalDivisor, setDimensionalDivisor] = useState("5000");
  const [roundingMode, setRoundingMode] = useState("ROUND_HALF_UP");
  const [quoteValidityMinutes, setQuoteValidityMinutes] = useState("30");
  const [showPriceBreakdownToCustomer, setShowPriceBreakdownToCustomer] = useState(true);
  const [autoInvoiceOnDelivery, setAutoInvoiceOnDelivery] = useState(true);

  useQuery({
    queryKey: ["pricing-settings"],
    queryFn: async () => {
      const settings = (await api.get("/v1/pricing/settings")).data as {
        dimensionalDivisor?: number;
        roundingMode?: string;
        quoteValidityMinutes?: number;
        showPriceBreakdownToCustomer?: boolean;
        autoInvoiceOnDelivery?: boolean;
      };
      setDimensionalDivisor(String(settings.dimensionalDivisor ?? 5000));
      setRoundingMode(settings.roundingMode ?? "ROUND_HALF_UP");
      setQuoteValidityMinutes(String(settings.quoteValidityMinutes ?? 30));
      setShowPriceBreakdownToCustomer(settings.showPriceBreakdownToCustomer ?? true);
      setAutoInvoiceOnDelivery(settings.autoInvoiceOnDelivery ?? true);
      return settings;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.patch("/v1/pricing/settings", {
        dimensionalDivisor: Number(dimensionalDivisor),
        roundingMode,
        quoteValidityMinutes: Number(quoteValidityMinutes),
        showPriceBreakdownToCustomer,
        autoInvoiceOnDelivery
      });
    }
  });

  return (
    <PricingSectionPage title="Pricing Settings" description="Global controls for divisor, rounding, quote expiry, and invoice automation.">
      <div className="grid gap-3 md:grid-cols-2">
        <Input value={dimensionalDivisor} onChange={(event) => setDimensionalDivisor(event.target.value)} placeholder="Dimensional divisor (5000/6000)" />
        <Select
          value={roundingMode}
          onValueChange={setRoundingMode}
          options={[
            { label: "ROUND_HALF_UP", value: "ROUND_HALF_UP" },
            { label: "ROUND_UP", value: "ROUND_UP" },
            { label: "ROUND_DOWN", value: "ROUND_DOWN" }
          ]}
        />
        <Input value={quoteValidityMinutes} onChange={(event) => setQuoteValidityMinutes(event.target.value)} placeholder="Quote validity minutes" />
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show price breakdown to customer</span>
            <Switch checked={showPriceBreakdownToCustomer} onCheckedChange={setShowPriceBreakdownToCustomer} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-gray-700">Auto invoice on delivery</span>
            <Switch checked={autoInvoiceOnDelivery} onCheckedChange={setAutoInvoiceOnDelivery} />
          </div>
        </div>
      </div>
      <Button onClick={() => saveMutation.mutate()}>Save pricing settings</Button>
    </PricingSectionPage>
  );
}

