import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

type CalculateResult = {
  chargeableWeightKg: number;
  breakdown: Array<{ label: string; amount: number }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  quoteExpiresAt: string;
};

export function PricingCalculatorPage() {
  const [payload, setPayload] = useState({
    originZoneId: "",
    destZoneId: "",
    serviceTier: "STANDARD",
    weightKg: "1",
    lengthCm: "10",
    widthCm: "10",
    heightCm: "10",
    declaredValue: "0",
    insuranceTier: "NONE",
    promoCode: "",
    customerId: ""
  });

  const [result, setResult] = useState<CalculateResult | null>(null);
  const calculateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<CalculateResult>("/v1/pricing/calculate", {
        ...payload,
        weightKg: Number(payload.weightKg),
        lengthCm: Number(payload.lengthCm),
        widthCm: Number(payload.widthCm),
        heightCm: Number(payload.heightCm),
        declaredValue: Number(payload.declaredValue),
        promoCode: payload.promoCode || undefined,
        customerId: payload.customerId || undefined
      });
      return response.data;
    },
    onSuccess: (data) => {
      setResult(data);
    }
  });

  return (
    <PricingSectionPage title="Pricing Calculator" description="Test quote calculations without creating a shipment.">
      <div className="grid gap-3 md:grid-cols-3">
        <Input value={payload.originZoneId} onChange={(event) => setPayload((prev) => ({ ...prev, originZoneId: event.target.value }))} placeholder="Origin zone ID" />
        <Input value={payload.destZoneId} onChange={(event) => setPayload((prev) => ({ ...prev, destZoneId: event.target.value }))} placeholder="Destination zone ID" />
        <Select
          value={payload.serviceTier}
          onValueChange={(value) => setPayload((prev) => ({ ...prev, serviceTier: value }))}
          options={[
            { label: "STANDARD", value: "STANDARD" },
            { label: "EXPRESS", value: "EXPRESS" },
            { label: "OVERNIGHT", value: "OVERNIGHT" }
          ]}
        />
        <Input value={payload.weightKg} onChange={(event) => setPayload((prev) => ({ ...prev, weightKg: event.target.value }))} placeholder="Weight kg" />
        <Input value={payload.lengthCm} onChange={(event) => setPayload((prev) => ({ ...prev, lengthCm: event.target.value }))} placeholder="Length cm" />
        <Input value={payload.widthCm} onChange={(event) => setPayload((prev) => ({ ...prev, widthCm: event.target.value }))} placeholder="Width cm" />
        <Input value={payload.heightCm} onChange={(event) => setPayload((prev) => ({ ...prev, heightCm: event.target.value }))} placeholder="Height cm" />
        <Input value={payload.declaredValue} onChange={(event) => setPayload((prev) => ({ ...prev, declaredValue: event.target.value }))} placeholder="Declared value" />
        <Input value={payload.promoCode} onChange={(event) => setPayload((prev) => ({ ...prev, promoCode: event.target.value }))} placeholder="Promo code (optional)" />
      </div>

      <Button onClick={() => calculateMutation.mutate()}>{calculateMutation.isPending ? "Calculating..." : "Calculate"}</Button>

      {result ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">Chargeable weight: {result.chargeableWeightKg}kg</p>
          <div className="mt-2 space-y-1">
            {result.breakdown.map((row, index) => (
              <div key={`${row.label}-${index}`} className="flex justify-between text-sm">
                <span>{row.label}</span>
                <span>{row.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-gray-200 pt-3 text-sm">
            <p>Subtotal: {result.subtotal.toFixed(2)} {result.currency}</p>
            <p>Tax ({result.taxRate}%): {result.taxAmount.toFixed(2)} {result.currency}</p>
            <p className="font-semibold">Total: {result.total.toFixed(2)} {result.currency}</p>
            <p className="text-xs text-gray-500">Quote expires at {new Date(result.quoteExpiresAt).toLocaleString()}</p>
          </div>
          <Button variant="secondary" className="mt-3">
            Save as quote
          </Button>
        </div>
      ) : null}
    </PricingSectionPage>
  );
}

