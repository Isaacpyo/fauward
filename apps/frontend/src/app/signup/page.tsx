import type { Metadata } from "next";
import Link from "next/link";

import BrandLogo from "@/components/marketing/BrandLogo";
import SignupForm from "@/components/marketing/SignupForm";
import { VALUE_PROP_BULLETS } from "@/lib/marketing-data";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Start your free trial",
    description: "Create your Fauward account and launch your tenant portal onboarding flow.",
    path: "/signup",
    noIndex: true
  });
}

export default function SignupPage() {
  return (
    <section className="min-h-screen bg-gray-50 bg-grid py-16 lg:py-24">
      <div className="marketing-container">
        <div className="grid gap-8 rounded-xl border border-gray-200 bg-white p-6 lg:grid-cols-2 lg:p-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 md:text-5xl">Start your free trial</h1>
            <p className="mt-4 text-lg text-gray-600">Set up your account and continue to onboarding to launch your branded platform.</p>
            <div className="mt-8">
              <SignupForm />
            </div>
          </div>

          <aside className="rounded-xl border border-gray-200 bg-gray-50 p-8">
            <div className="mb-6 w-[200px]">
              <BrandLogo variant="lockup" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">What you get from day one</h2>
            <ul className="mt-6 space-y-4">
              {VALUE_PROP_BULLETS.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3 text-base text-gray-700">
                  <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-amber-600" aria-hidden />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className="mt-8 inline-flex h-11 items-center justify-center rounded-lg border border-amber-600 px-5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
            >
              View pricing plans
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
