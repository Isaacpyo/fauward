import Link from "next/link";

const popularLinks = [
  { href: "/features", label: "Platform features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/services", label: "Our services" },
  { href: "/agent", label: "AI Agent" },
  { href: "/support", label: "Help centre" },
  { href: "/contact", label: "Contact us" },
];

export default function NotFoundPage() {
  return (
    <section className="bg-white py-24 lg:py-32">
      <div className="marketing-container max-w-2xl text-center">
        <p className="text-8xl font-black text-gray-100 select-none leading-none">404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">
          This page got lost in transit
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base text-gray-600">
          Looks like this shipment took a wrong turn. The page you&apos;re looking for doesn&apos;t exist — but the rest of the platform is right where you left it.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-7 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            Go home
          </Link>
          <Link
            href="/support"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-7 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Help centre
          </Link>
        </div>

        <div className="mt-14 text-left">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Popular pages</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {popularLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
              >
                <span className="text-gray-400">→</span>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
