"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-2xl">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8">
          <h1 className="text-3xl font-bold text-red-700">Something went wrong</h1>
          <p className="mt-4 text-base text-red-700">
            We could not load this page right now. Retry, or return to the homepage.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-6 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-6 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
