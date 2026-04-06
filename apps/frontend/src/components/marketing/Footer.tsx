import Link from "next/link";
import BrandLogo from "@/components/marketing/BrandLogo";

const footerColumns = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/login", label: "Log in" },
      { href: "/signup", label: "Start Free Trial" }
    ]
  },
  {
    title: "Regions",
    links: [
      { href: "/regions/uk", label: "United Kingdom" },
      { href: "/regions/africa", label: "Africa" },
      { href: "/regions/mena", label: "MENA" }
    ]
  },
  {
    title: "Company",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/features/white-label", label: "White-label" },
      { href: "/features/finance", label: "Finance" }
    ]
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/terms", label: "Terms of Service" },
      { href: "/legal/cookies", label: "Cookie Policy" }
    ]
  }
];

const socialLinks = [
  { href: "https://www.linkedin.com", label: "LinkedIn" },
  { href: "https://x.com", label: "X" },
  { href: "https://www.youtube.com", label: "YouTube" }
];

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="marketing-container py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr,2fr]">
          <div className="space-y-5">
            <div className="w-[44px]">
              <BrandLogo variant="mark" />
            </div>
            <p className="max-w-sm text-base text-gray-600">
              Launch a fully branded logistics platform — shipment ops, invoicing, driver app, and customer tracking. No code. No per-seat fees.
            </p>

            <form className="space-y-3" action="#" method="post">
              <label htmlFor="newsletter-email" className="block text-sm font-medium text-gray-700">
                Newsletter
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="newsletter-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm outline-none ring-amber-600/20 transition focus:ring"
                />
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700"
                >
                  Subscribe
                </button>
              </div>
            </form>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-900">{column.title}</h3>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm text-gray-600 transition hover:text-brand-navy">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} Fauward. All rights reserved.</p>
          <div className="flex items-center gap-4">
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-gray-600 transition hover:text-brand-navy"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
