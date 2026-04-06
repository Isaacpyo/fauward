import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Privacy policy",
    description: "Read how Fauward handles and protects personal data.",
    path: "/legal/privacy"
  });
}

export default function PrivacyPolicyPage() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900 md:text-5xl">Privacy Policy</h1>
        <p className="mt-6 text-lg text-gray-600">
          Fauward processes customer and operational data to deliver shipment tracking, invoicing, and platform services.
        </p>
        <p className="mt-4 text-base text-gray-700">
          Contact privacy@fauward.com for data requests, security questions, or privacy concerns.
        </p>
      </div>
    </section>
  );
}
