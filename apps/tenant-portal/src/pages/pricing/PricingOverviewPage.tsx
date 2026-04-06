import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

async function fetchOverview() {
  const [rateCardsRes, rulesRes, promoRes, settingsRes] = await Promise.all([
    api.get<{ rateCards: unknown[] }>("/v1/pricing/rate-cards"),
    api.get<{ rules: unknown[] }>("/v1/pricing/rules"),
    api.get<{ promoCodes: unknown[] }>("/v1/pricing/promo-codes"),
    api.get("/v1/pricing/settings")
  ]);

  return {
    rateCardsCount: rateCardsRes.data.rateCards.length,
    rulesCount: rulesRes.data.rules.length,
    promoCodesCount: promoRes.data.promoCodes.length,
    settings: settingsRes.data as { defaultCurrency?: string; taxRate?: number }
  };
}

export function PricingOverviewPage() {
  const query = useQuery({
    queryKey: ["pricing-overview"],
    queryFn: fetchOverview
  });

  const summary = query.data ?? {
    rateCardsCount: 0,
    rulesCount: 0,
    promoCodesCount: 0,
    settings: { defaultCurrency: "GBP", taxRate: 0 }
  };

  return (
    <PageShell title="Pricing Overview" description="Control zones, rates, surcharges, rules, promos, tax, and quote behaviour.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Active rate cards</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{summary.rateCardsCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Enabled rules</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{summary.rulesCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Promo codes</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{summary.promoCodesCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Tax rate</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{Number(summary.settings.taxRate ?? 0)}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Base currency</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{summary.settings.defaultCurrency ?? "GBP"}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link to="/pricing/calculator">Test your pricing</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/pricing/rate-cards">Manage rate cards</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/pricing/rules">Manage pricing rules</Link>
        </Button>
      </div>
    </PageShell>
  );
}

