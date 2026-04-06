"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
  const [pulsing, setPulsing] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setPulsing(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <style>{`
        @keyframes cta-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.5); }
          50% { box-shadow: 0 0 0 8px rgba(251,191,36,0); }
        }
        .cta-pulse { animation: cta-pulse 1s ease-in-out 3; }
      `}</style>
      <header
        className={`sticky top-0 z-50 transition-colors duration-200 ${
          scrolled ? "border-b border-gray-200 bg-white/95 backdrop-blur" : "bg-transparent"
        }`}
      >
        <div className="marketing-container">
          <div className="flex min-h-[72px] items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center" aria-label="Fauward home">
              <span className="inline-flex w-[46px]">
                <BrandLogo variant="mark" priority />
              </span>
            </Link>

            <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative text-sm font-medium transition hover:text-brand-navy ${isActive ? "text-brand-navy" : "text-gray-700"}`}
                  >
                    {link.label}
                    {isActive && (
                      <span className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-amber-600" />
                    )}
                  </Link>
                );
              })}
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
                className={`inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-6 text-sm font-semibold text-white transition hover:bg-amber-700 ${pulsing ? "cta-pulse" : ""}`}
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

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out lg:hidden ${mobileOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
          >
            <div className="border-t border-gray-200 py-4">
              <nav className="flex flex-col gap-2" aria-label="Mobile navigation">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={`inline-flex min-h-[44px] items-center rounded-md px-3 text-base font-medium hover:bg-gray-50 ${isActive ? "text-amber-700" : "text-gray-700"}`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
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
          </div>
        </div>
      </header>
    </>
  );
}
