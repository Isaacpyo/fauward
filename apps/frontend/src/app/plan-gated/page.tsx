import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";
import { MagneticButton } from "@/components/marketing/effects/MagneticButton";
import { MaskRevealHeading } from "@/components/marketing/effects/MaskRevealHeading";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Upgrade required",
    description: "This feature requires a higher plan.",
    path: "/plan-gated",
    noIndex: true
  });
}

export default function PlanGatedPage() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-2xl">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-8">
          <MaskRevealHeading className="text-3xl font-bold text-brand-navy">
            Upgrade required
          </MaskRevealHeading>
          <p className="mt-4 text-base text-gray-700">
            Your current plan does not include this capability. Upgrade to Pro or Enterprise to continue.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <MagneticButton
              href="/pricing"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-6 text-sm font-semibold text-white hover:bg-amber-700"
            >
              View pricing
            </MagneticButton>
            <MagneticButton
              href="/signup?plan=enterprise"
              strength={0.18}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-6 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Contact sales
            </MagneticButton>
          </div>
        </div>
      </div>
    </section>
  );
}
