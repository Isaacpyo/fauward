import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-2xl">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8">
          <h1 className="text-3xl font-bold text-gray-900">Page not found</h1>
          <p className="mt-4 text-base text-gray-600">The page you requested does not exist or may have moved.</p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-6 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Return home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
