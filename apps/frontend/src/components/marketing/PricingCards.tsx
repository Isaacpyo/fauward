"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ANNUAL_DISCOUNT_BADGE,
  type BillingPeriod,
  PRICING_DIFFERENTIATOR,
  PRICING_PLANS
} from "@/lib/marketing-data";

type PricingCardsProps = {
  initialBilling?: BillingPeriod;
  showToggle?: boolean;
  condensed?: boolean;
  showPricingLink?: boolean;
  showDifferentiator?: boolean;
};

function formatPrice(price: number | null): string {
  if (price === null) {
    return "Custom";
  }
  return `£${price}`;
}

export default function PricingCards({
  initialBilling = "monthly",
  showToggle = true,
  condensed = false,
  showPricingLink = false,
  showDifferentiator = false
}: PricingCardsProps) {
  const [billing, setBilling] = useState<BillingPeriod>(initialBilling);

  const plans = useMemo(() => PRICING_PLANS, []);

  return (
    <div className="space-y-8">
      {showToggle ? (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              className={`inline-flex h-11 min-w-[130px] items-center justify-center rounded-md px-4 text-sm font-semibold ${
                billing === "monthly" ? "bg-brand-navy text-white" : "text-gray-700"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling("annual")}
              className={`inline-flex h-11 min-w-[130px] items-center justify-center rounded-md px-4 text-sm font-semibold ${
                billing === "annual" ? "bg-brand-navy text-white" : "text-gray-700"
              }`}
            >
              Annual
            </button>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            {ANNUAL_DISCOUNT_BADGE}
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = billing === "annual" ? plan.annualMonthlyEquivalent : plan.monthlyPrice;
          const cardBorder = plan.recommended ? "border-amber-400" : "border-gray-200";

          return (
            <div key={plan.id} className={`rounded-xl border ${cardBorder} bg-white p-8`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900">{plan.name}</h3>
                  <p className="mt-2 text-sm text-gray-600">{plan.tagline}</p>
                </div>
                {plan.recommended ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Recommended</span>
                ) : null}
              </div>

              <div className="mt-6">
                <p className="text-4xl font-bold text-gray-900">
                  {formatPrice(price)}
                  {price !== null ? <span className="text-base font-medium text-gray-500">/mo</span> : null}
                </p>
                {billing === "annual" && plan.annualBillingLabel ? (
                  <p className="mt-2 text-sm text-gray-500">{plan.annualBillingLabel}</p>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">Billed monthly</p>
                )}
              </div>

              <div className="mt-6 space-y-1 text-sm text-gray-700">
                <p>{plan.shipmentLimit}</p>
                <p>{plan.staffLimit}</p>
              </div>

              <Link
                href={plan.ctaHref}
                className={`mt-6 inline-flex h-12 w-full items-center justify-center rounded-lg px-6 text-sm font-semibold transition ${
                  plan.recommended
                    ? "bg-amber-600 text-white hover:bg-amber-700"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {plan.ctaLabel}
              </Link>

              <ul className="mt-6 space-y-2">
                {(condensed ? plan.features.slice(0, 3) : plan.features).map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-brand-navy" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {showDifferentiator ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-center">
          <p className="text-base font-semibold text-brand-navy">{PRICING_DIFFERENTIATOR.headline}</p>
          <p className="mt-2 text-sm text-gray-600">
            <span className="line-through opacity-60">{PRICING_DIFFERENTIATOR.comparisonPrice}</span>
            <span className="mx-2 font-bold text-amber-700">{PRICING_DIFFERENTIATOR.fauwardPrice}</span>
            <span className="text-gray-500">— one workspace, unlimited seats</span>
          </p>
        </div>
      ) : null}

      {showPricingLink ? (
        <div className="text-center">
          <Link href="/pricing" className="text-sm font-semibold text-brand-navy underline-offset-4 hover:underline">
            See full pricing
          </Link>
        </div>
      ) : null}
    </div>
  );
}
