import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Cookie policy",
    description: "Understand how Fauward uses cookies for analytics and platform functionality.",
    path: "/legal/cookies"
  });
}

export default function CookiePolicyPage() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900 md:text-5xl">Cookie Policy</h1>
        <p className="mt-6 text-lg text-gray-600">
          Fauward uses cookies to keep sessions secure, measure site performance, and improve onboarding experience.
        </p>
        <p className="mt-4 text-base text-gray-700">You can manage cookie preferences in your browser settings at any time.</p>
      </div>
    </section>
  );
}
