import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
  quoteRequest,
  SERVICE_TIERS,
  type ShipmentQuote,
  type ShipmentWizardData
} from "@/components/shipments/wizard-types";

type StepServiceProps = {
  data: ShipmentWizardData;
  onChange: (data: ShipmentWizardData) => void;
  errors?: string[];
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

/** Live quote from the pricing engine for the selected tier; the shipment is priced by the same engine on create. */
export function useShipmentQuote(data: ShipmentWizardData) {
  const body = quoteRequest(data);
  return useQuery({
    queryKey: ["shipment-quote", body],
    queryFn: async () => (await api.post<ShipmentQuote>("/v1/pricing/calculate", body)).data,
    enabled: body.weightKg > 0,
    staleTime: 60_000,
    retry: false
  });
}

export function QuoteSummary({ data }: { data: ShipmentWizardData }) {
  const quote = useShipmentQuote(data);

  if (quote.isLoading) return <p className="text-sm text-gray-500">Calculating price…</p>;
  if (quote.isError) {
    return (
      <p className="text-sm text-red-700" role="alert">
        {apiErrorMessage(quote.error, "The price could not be calculated.")} The shipment is priced when it is created.
      </p>
    );
  }
  if (!quote.data) return <p className="text-sm text-gray-500">Enter the package weight to see a price.</p>;

  const { breakdown, subtotal, taxRate, taxAmount, total, currency } = quote.data;
  return (
    <dl className="space-y-2 text-sm text-gray-700" data-testid="shipment-quote">
      {breakdown.map((row, index) => (
        <div key={`${row.label}-${index}`} className="flex items-center justify-between">
          <dt>{row.label}</dt>
          <dd>{formatMoney(row.amount, currency)}</dd>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <dt>Subtotal</dt>
        <dd>{formatMoney(subtotal, currency)}</dd>
      </div>
      {taxAmount > 0 ? (
        <div className="flex items-center justify-between">
          <dt>Tax ({taxRate}%)</dt>
          <dd>{formatMoney(taxAmount, currency)}</dd>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
        <dt>Total</dt>
        <dd>{formatMoney(total, currency)}</dd>
      </div>
    </dl>
  );
}

export function StepService({ data, onChange, errors = [] }: StepServiceProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {SERVICE_TIERS.map((option) => (
          <button
            type="button"
            key={option.tier}
            onClick={() => onChange({ ...data, serviceTier: option.tier })}
            aria-pressed={data.serviceTier === option.tier}
            className={cn(
              "rounded-lg border bg-white p-4 text-left",
              data.serviceTier === option.tier
                ? "border-[var(--tenant-primary)] ring-2 ring-[var(--tenant-primary-light)]"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <h3 className="text-base font-semibold text-gray-900">{option.label}</h3>
            <p className="mt-1 text-xs text-gray-500">Priced by your rate cards</p>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Price</h3>
        <QuoteSummary data={data} />
      </div>

      {errors.length > 0 ? (
        <ul className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.map((error) => (
            <li key={error}>• {error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
