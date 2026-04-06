import { UserPlus, PackagePlus, Share2, type LucideIcon } from "lucide-react";

import { HOW_IT_WORKS_STEPS, type HowItWorksStep } from "@/lib/marketing-data";

const ICON_MAP: Record<HowItWorksStep["icon"], LucideIcon> = {
  "user-plus": UserPlus,
  "package-plus": PackagePlus,
  "share-2": Share2,
};

export default function HowItWorks() {
  return (
    <section className="bg-[#0d1f3c] py-16 lg:py-24">
      <div className="marketing-container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-white lg:text-4xl">
            From sign-up to live shipments — in one afternoon
          </h2>
          <p className="mt-4 text-lg text-blue-100">
            No developer required. No month-long setup. No hidden gotchas.
          </p>
        </div>

        <div className="relative mt-14 grid gap-6 md:grid-cols-3">
          {/* Connector line (desktop only) */}
          <div
            className="absolute left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] top-[28px] hidden h-px bg-blue-800 md:block"
            aria-hidden
          />

          {HOW_IT_WORKS_STEPS.map((step) => {
            const Icon = ICON_MAP[step.icon];

            return (
              <div key={step.step} className="relative flex flex-col items-center text-center">
                <div className="relative z-10 mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 ring-4 ring-[#0d1f3c]">
                  <Icon className="h-7 w-7 text-white" aria-hidden />
                </div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.15em] text-blue-400">
                  Step {step.step}
                </p>
                <h3 className="text-xl font-bold text-white">{step.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-blue-200">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
