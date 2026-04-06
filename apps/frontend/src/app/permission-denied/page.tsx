import type { Metadata } from "next";
import Link from "next/link";

import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Permission denied",
    description: "You do not have access to this resource.",
    path: "/permission-denied"
  });
}

export default function PermissionDeniedPage() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-2xl">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8">
          <h1 className="text-3xl font-bold text-gray-900">Permission denied</h1>
          <p className="mt-4 text-base text-gray-600">
            Your account does not have access to this page. Contact your administrator to request access.
          </p>
          <div className="mt-6">
            <Link href="/" className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-6 text-sm font-semibold text-gray-700 hover:bg-gray-100">
              Back to homepage
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
