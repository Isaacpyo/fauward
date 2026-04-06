import { UserPlus, PackagePlus, Share2, type LucideIcon } from "lucide-react";

import { HOW_IT_WORKS_STEPS, type HowItWorksStep } from "@/lib/marketing-data";

const ICON_MAP: Record<HowItWorksStep["icon"], LucideIcon> = {
  "user-plus": UserPlus,
  "package-plus": PackagePlus,
  "share-2": Share2,
};

export default function HowItWorks() {
  return (
    <>
      <style>{`
        @keyframes line-fill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .connector-line {
          transform-origin: left;
          animation: line-fill 0.8s ease-out 0.5s both;
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .step-0 { animation: fade-up 0.5s ease-out 0ms both; }
        .step-1 { animation: fade-up 0.5s ease-out 150ms both; }
        .step-2 { animation: fade-up 0.5s ease-out 300ms both; }
      `}</style>
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
            {/* Animated connector line (desktop only) */}
            <div
              className="connector-line absolute left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] top-[28px] hidden h-px bg-amber-500/50 md:block"
              aria-hidden
            />

            {HOW_IT_WORKS_STEPS.map((step, i) => {
              const Icon = ICON_MAP[step.icon];

              return (
                <div key={step.step} className={`step-${i} relative flex flex-col items-center text-center`}>
                  <div className="relative z-10 mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 ring-4 ring-[#0d1f3c]">
                    <Icon className="h-7 w-7 text-white" aria-hidden />
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-amber-600 shadow">
                      {step.step}
                    </span>
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
    </>
  );
}
