import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Terms of service",
    description: "Review Fauward terms for trial usage, billing, and platform access.",
    path: "/legal/terms"
  });
}

export default function TermsPage() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900 md:text-5xl">Terms of Service</h1>
        <p className="mt-6 text-lg text-gray-600">
          These terms govern access to Fauward software and associated services. Plan limits, billing, and support levels are defined by your subscription.
        </p>
        <p className="mt-4 text-base text-gray-700">
          Enterprise agreements may include custom legal terms, SLAs, and compliance provisions.
        </p>
      </div>
    </section>
  );
}
