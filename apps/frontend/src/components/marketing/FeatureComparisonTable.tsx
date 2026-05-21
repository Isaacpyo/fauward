"use client";

import { motion } from "framer-motion";
import { Check, X, Star } from "lucide-react";

import { FEATURE_COMPARISON_ROWS, type ComparisonValue } from "@/lib/marketing-data";

const EASE = [0.22, 1, 0.36, 1] as const;

function renderComparisonValue(value: ComparisonValue, highlight?: boolean) {
  if (typeof value === "boolean") {
    return value ? (
      <span
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
          highlight ? "bg-amber-500 text-white" : "bg-green-100 text-green-700"
        }`}
        aria-label="Included"
      >
        <Check size={13} strokeWidth={3} />
      </span>
    ) : (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-400" aria-label="Not included">
        <X size={13} strokeWidth={3} />
      </span>
    );
  }

  return <span className="text-sm font-medium text-gray-700">{value}</span>;
}

const PLANS = [
  { key: "starter",    label: "Starter",    sub: "For new operators",      highlight: false },
  { key: "pro",        label: "Pro",        sub: "Most popular",           highlight: true  },
  { key: "enterprise", label: "Enterprise", sub: "For scaled operations",  highlight: false },
] as const;

type PlanKey = (typeof PLANS)[number]["key"];

export default function FeatureComparisonTable() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.7, ease: EASE }}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="sticky top-[72px] z-10">
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-gray-200 bg-gradient-to-br from-slate-50 to-white px-5 py-5 text-left text-sm font-bold uppercase tracking-widest text-gray-500">
                Features
              </th>
              {PLANS.map((plan) => (
                <th
                  key={plan.key}
                  className={`relative border-b border-gray-200 px-5 py-5 text-left ${
                    plan.highlight ? "bg-gradient-to-br from-amber-50 to-orange-50" : "bg-gradient-to-br from-slate-50 to-white"
                  }`}
                >
                  {plan.highlight && (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow">
                      <Star size={9} strokeWidth={3} fill="currentColor" /> Popular
                    </span>
                  )}
                  <div className={`text-lg font-bold ${plan.highlight ? "text-amber-700" : "text-gray-900"}`}>{plan.label}</div>
                  <div className="mt-0.5 text-xs font-medium text-gray-500">{plan.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_COMPARISON_ROWS.map((row, index) => (
              <motion.tr
                key={row.feature}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ delay: index * 0.03, duration: 0.45, ease: EASE }}
                className={`group transition-colors hover:bg-amber-50/30 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
              >
                <td className="sticky left-0 border-b border-r border-gray-200 bg-inherit px-5 py-4 text-sm font-semibold text-gray-900">
                  {row.feature}
                </td>
                {(["starter", "pro", "enterprise"] as PlanKey[]).map((key) => {
                  const plan = PLANS.find((p) => p.key === key)!;
                  return (
                    <td
                      key={key}
                      className={`border-b border-gray-200 px-5 py-4 ${plan.highlight ? "bg-amber-50/30 group-hover:bg-amber-50/60" : ""}`}
                    >
                      {renderComparisonValue(row[key], plan.highlight)}
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
