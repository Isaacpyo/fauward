"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import BrandLogo from "@/components/marketing/BrandLogo";

const navLinks = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/regions/uk", label: "Regions" },
  { href: "/docs", label: "Docs" }
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-200 ${
        scrolled ? "border-b border-gray-200 bg-white/95 backdrop-blur" : "bg-transparent"
      }`}
    >
      <div className="marketing-container">
        <div className="flex min-h-[72px] items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Fauward home">
            <span className="hidden w-[172px] sm:inline-flex">
              <BrandLogo variant="wordmark" priority />
            </span>
            <span className="inline-flex w-[46px] sm:hidden">
              <BrandLogo variant="mark" priority />
            </span>
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm font-medium text-gray-700 transition hover:text-brand-navy">
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-700 transition hover:text-brand-navy"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-6 text-sm font-semibold text-white transition hover:bg-amber-700"
            >
              Start Free Trial
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 text-gray-700 lg:hidden"
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="border-t border-gray-200 py-4 lg:hidden">
            <nav className="flex flex-col gap-2" aria-label="Mobile navigation">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex min-h-[44px] items-center rounded-md px-3 text-base font-medium text-gray-700 hover:bg-gray-50"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="inline-flex min-h-[44px] items-center rounded-md px-3 text-base font-medium text-gray-700 hover:bg-gray-50"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-amber-600 px-6 font-semibold text-white hover:bg-amber-700"
              >
                Start Free Trial
              </Link>
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}
