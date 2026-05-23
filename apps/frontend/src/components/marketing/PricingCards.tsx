"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

import {
  ANNUAL_DISCOUNT_BADGE,
  type BillingPeriod,
  PRICING_DIFFERENTIATOR,
  PRICING_PLANS,
} from "@/lib/marketing-data";

type PricingCardsProps = {
  initialBilling?: BillingPeriod;
  showToggle?: boolean;
  condensed?: boolean;
  showPricingLink?: boolean;
  showDifferentiator?: boolean;
};

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

function formatPrice(price: number | null): string {
  if (price === null) {
    return "Custom";
  }
  return `£${price}`;
}

const cardEntrance = (index: number) => ({
  hidden: { opacity: 0, y: 40, scale: 0.95, filter: "blur(10px)" },
  show:   {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.7, delay: index * 0.15, ease: EASE },
  },
});

export default function PricingCards({
  initialBilling = "monthly",
  showToggle = true,
  condensed = false,
  showPricingLink = false,
  showDifferentiator = false,
}: PricingCardsProps) {
  const [billing, setBilling] = useState<BillingPeriod>(initialBilling);

  const plans = useMemo(() => PRICING_PLANS, []);

  return (
    <div className="space-y-10">
      {showToggle ? (
        <motion.div
          className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="relative inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {(["monthly", "annual"] as const).map((option) => {
              const isActive = billing === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setBilling(option)}
                  className={`relative z-10 inline-flex h-11 min-w-[130px] items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors ${
                    isActive ? "text-white" : "text-gray-700"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="billing-pill"
                      className="absolute inset-0 -z-10 rounded-md bg-brand-navy"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  {option === "monthly" ? "Monthly" : "Annually"}
                </button>
              );
            })}
          </div>
          <motion.span
            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 20 }}
          >
            {ANNUAL_DISCOUNT_BADGE}
          </motion.span>
        </motion.div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-stretch">
        {plans.map((plan, index) => {
          const price = billing === "annual" ? plan.annualMonthlyEquivalent : plan.monthlyPrice;
          const isFeatured = plan.recommended;

          return (
            <motion.div
              key={plan.id}
              variants={cardEntrance(index)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
              whileHover={{ y: -8 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className={`relative isolate flex flex-col rounded-2xl bg-white p-8 shadow-sm ${
                isFeatured ? "lg:-my-3 lg:scale-[1.03]" : ""
              }`}
            >
              {/* Static accent border + soft glow for the featured plan */}
              {isFeatured && (
                <>
                  <span
                    aria-hidden
                    className="absolute inset-0 -z-10 rounded-2xl border-2 border-amber-500"
                  />
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute -inset-6 -z-20 rounded-3xl bg-amber-400/25 blur-3xl"
                    animate={{ opacity: [0.3, 0.55, 0.3] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                </>
              )}

              {!isFeatured && (
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-2xl border border-gray-200"
                />
              )}

              {/* Popular badge */}
              {isFeatured && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.9 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4, type: "spring", stiffness: 300, damping: 18 }}
                  className="absolute -top-3 left-1/2 -translate-x-1/2"
                >
                  <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white shadow-lg shadow-amber-500/30">
                    ★ Most Popular
                  </span>
                </motion.div>
              )}

              <div>
                <h3 className="text-2xl font-semibold text-gray-900">{plan.name}</h3>
                <p className="mt-2 text-sm text-gray-600">{plan.tagline}</p>
              </div>

              <div className="mt-6 min-h-[88px]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`${plan.id}-${billing}`}
                    initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                    transition={{ duration: 0.3, ease: EASE }}
                  >
                    <p className="text-4xl font-bold text-gray-900">
                      {formatPrice(price)}
                      {price !== null && (
                        <span className="text-base font-medium text-gray-500">/mo</span>
                      )}
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                      {billing === "annual" && plan.annualBillingLabel
                        ? plan.annualBillingLabel
                        : "Billed monthly"}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-4 space-y-1 text-sm text-gray-700">
                <p>{plan.shipmentLimit}</p>
                <p>{plan.staffLimit}</p>
              </div>

              <MotionLink
                href={plan.ctaHref}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className={`group relative mt-6 inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-lg px-6 text-sm font-semibold ${
                  isFeatured
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30"
                    : "border border-gray-300 text-gray-700"
                }`}
              >
                <span className="relative z-10">{plan.ctaLabel}</span>
                {!isFeatured && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 -z-0"
                    initial={{ y: "100%" }}
                    whileHover={{ y: "0%" }}
                    transition={{ duration: 0.4, ease: EASE }}
                    style={{ background: "linear-gradient(135deg, #0d1f3c 0%, #1e3a8a 100%)" }}
                  />
                )}
                {isFeatured && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 -z-0"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.7, ease: EASE }}
                    style={{
                      background:
                        "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)",
                    }}
                  />
                )}
              </MotionLink>

              <ul className="mt-6 space-y-2.5">
                {(condensed ? plan.features.slice(0, 3) : plan.features).map((feature, fi) => (
                  <motion.li
                    key={feature}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.4 + index * 0.15 + fi * 0.04, duration: 0.4, ease: EASE }}
                    className="flex items-start gap-2 text-sm text-gray-700"
                  >
                    <span
                      className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                        isFeatured ? "bg-amber-500 text-white" : "bg-gray-100 text-brand-navy"
                      }`}
                      aria-hidden
                    >
                      <Check size={11} strokeWidth={3} />
                    </span>
                    <span>{feature}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>

      {showDifferentiator ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-center"
        >
          <p className="text-base font-semibold text-brand-navy">{PRICING_DIFFERENTIATOR.headline}</p>
          <p className="mt-2 text-sm text-gray-600">
            <span className="line-through opacity-60">{PRICING_DIFFERENTIATOR.comparisonPrice}</span>
            <span className="mx-2 font-bold text-amber-700">{PRICING_DIFFERENTIATOR.fauwardPrice}</span>
            <span className="text-gray-500">— one workspace, unlimited seats</span>
          </p>
        </motion.div>
      ) : null}

      {showPricingLink ? (
        <div className="text-center">
          <MotionLink
            href="/pricing"
            initial="rest"
            animate="rest"
            whileHover="hover"
            className="relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-lg border px-7 text-sm font-semibold shadow-sm"
            variants={{
              rest:  { borderColor: "#d1d5db", color: "#0D1F3C" },
              hover: { borderColor: "#b45309", color: "#ffffff" },
            }}
            transition={{ duration: 0.3 }}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 -z-0"
              variants={{
                rest:  { y: "100%" },
                hover: { y: "0%" },
              }}
              transition={{ duration: 0.4, ease: EASE }}
              style={{ background: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)" }}
            />
            <span className="relative z-10 inline-flex items-center gap-2">
              See full pricing
              <motion.span
                variants={{
                  rest:  { x: 0 },
                  hover: { x: 4 },
                }}
                transition={{ duration: 0.3 }}
              >
                <ArrowRight size={16} />
              </motion.span>
            </span>
          </MotionLink>
        </div>
      ) : null}
    </div>
  );
}
