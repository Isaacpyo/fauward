import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";
import { MagneticButton } from "@/components/marketing/effects/MagneticButton";
import { MaskRevealHeading } from "@/components/marketing/effects/MaskRevealHeading";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Permission denied",
    description: "You do not have access to this resource.",
    path: "/permission-denied",
    noIndex: true
  });
}

export default function PermissionDeniedPage() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-2xl">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8">
          <MaskRevealHeading className="text-3xl font-bold text-gray-900">
            Permission denied
          </MaskRevealHeading>
          <p className="mt-4 text-base text-gray-600">
            Your account does not have access to this page. Contact your administrator to request access.
          </p>
          <div className="mt-6">
            <MagneticButton
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-6 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Back to homepage
            </MagneticButton>
          </div>
        </div>
      </div>
    </section>
  );
}
