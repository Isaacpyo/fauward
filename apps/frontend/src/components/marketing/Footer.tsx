"use client";

import Link from "next/link";
import { useState } from "react";
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
  {
    href: "https://www.linkedin.com",
    label: "LinkedIn",
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    )
  },
  {
    href: "https://x.com",
    label: "X",
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    )
  },
  {
    href: "https://www.youtube.com",
    label: "YouTube",
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    )
  }
];

export default function Footer() {
  const [subscribed, setSubscribed] = useState(false);

  function handleSubscribe(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubscribed(true);
  }

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

            <form className="space-y-3" onSubmit={handleSubscribe}>
              <label htmlFor="newsletter-email" className="block text-sm font-medium text-gray-700">
                Newsletter
              </label>
              {subscribed ? (
                <p className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm font-semibold text-green-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  You&apos;re on the list ✓
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="newsletter-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700"
                  >
                    Subscribe
                  </button>
                </div>
              )}
            </form>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-900">{column.title}</h3>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm text-gray-600 transition hover:text-amber-600">
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
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition hover:text-amber-600"
              >
                {link.icon}
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
