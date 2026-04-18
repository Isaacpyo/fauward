"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, Package, DollarSign, Map, FileText, Briefcase, Info, Newspaper, Headphones, Bot, LayoutGrid, Smartphone, Code, MapPin } from "lucide-react";
import BrandLogo from "@/components/marketing/BrandLogo";

type MegaMenuItem = { href: string; label: string; description: string; icon: React.ElementType };
type NavItem =
  | { href: string; label: string; mega?: never }
  | { href?: never; label: string; mega: { columns: Array<{ heading: string; items: MegaMenuItem[] }> } };

const navItems: NavItem[] = [
  {
    label: "Product",
    mega: {
      columns: [
        {
          heading: "Platform",
          items: [
            { href: "/features", label: "Features", description: "Full platform overview", icon: LayoutGrid },
            { href: "/pricing", label: "Pricing", description: "Flat-rate, no per-seat fees", icon: DollarSign },
            { href: "/agent", label: "AI Agent", description: "Autonomous dispatch & ops", icon: Bot },
          ],
        },
        {
          heading: "Capabilities",
          items: [
            { href: "/features/shipment-management", label: "Shipment Ops", description: "End-to-end lifecycle", icon: Package },
            { href: "/features/finance", label: "Finance & Invoicing", description: "Auto-generate & collect", icon: FileText },
            { href: "/features/white-label", label: "White-label", description: "Your brand, your domain", icon: Map },
            { href: "/services#driver-app", label: "Driver App", description: "Offline-first mobile", icon: Smartphone },
            { href: "/services#api-integrations", label: "API & Integrations", description: "REST, webhooks, carriers", icon: Code },
            { href: "/services#customer-tracking", label: "Customer Tracking", description: "Public branded portal", icon: MapPin },
          ],
        },
      ],
    },
  },
  {
    label: "Solutions",
    mega: {
      columns: [
        {
          heading: "By Business Type",
          items: [
            { href: "/services#courier-startups", label: "Courier Startups", description: "Launch in an afternoon", icon: Package },
            { href: "/services#freight-operators", label: "Freight Operators", description: "Multi-depot operations", icon: Briefcase },
            { href: "/services#3pl-providers", label: "3PL Providers", description: "White-label for clients", icon: LayoutGrid },
            { href: "/services#enterprise-fleets", label: "Enterprise Fleets", description: "SSO, SLA, scale", icon: Map },
          ],
        },
        {
          heading: "Services",
          items: [
            { href: "/services", label: "Our Services", description: "Everything we offer", icon: Briefcase },
            { href: "/regions/uk", label: "United Kingdom", description: "VAT, GoCardless, DPD", icon: Map },
            { href: "/regions/africa", label: "Africa", description: "M-Pesa, Paystack", icon: Map },
            { href: "/regions/mena", label: "MENA", description: "COD, Aramex, Checkout.com", icon: Map },
          ],
        },
      ],
    },
  },
  {
    label: "Company",
    mega: {
      columns: [
        {
          heading: "Who We Are",
          items: [
            { href: "/about", label: "About Us", description: "Our story and team", icon: Info },
            { href: "/news", label: "News & Updates", description: "Product news and insights", icon: Newspaper },
          ],
        },
        {
          heading: "Support",
          items: [
            { href: "/support", label: "Help Centre", description: "Guides and FAQs", icon: Headphones },
            { href: "/support#contact", label: "Contact Support", description: "Reach our team", icon: Headphones },
            { href: "/docs", label: "Documentation", description: "API and developer docs", icon: Code },
          ],
        },
      ],
    },
  },
];

function MegaMenuPanel({
  columns,
  onClose,
}: {
  columns: Array<{ heading: string; items: MegaMenuItem[] }>;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-1/2 top-full z-50 mt-2 w-[720px] max-w-[96vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-200/60 ring-1 ring-gray-100">
      <div className={`grid p-4 gap-1`} style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((col) => (
          <div key={col.heading} className="px-2 py-2">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">{col.heading}</p>
            <ul className="space-y-0.5">
              {col.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-amber-50"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition group-hover:bg-amber-100 group-hover:text-amber-700">
                        <Icon size={16} />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-gray-800 group-hover:text-amber-700">{item.label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-gray-500">{item.description}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 bg-gray-50 px-6 py-3 flex items-center justify-between">
        <p className="text-xs text-gray-500">First shipment live in under 10 minutes — no engineer required.</p>
        <Link
          href="/signup"
          onClick={onClose}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-4 text-xs font-semibold text-white transition hover:bg-amber-700"
        >
          Start Free Trial
        </Link>
      </div>
    </div>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [pulsing, setPulsing] = useState(true);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close mega-menu on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Close on route change
  useEffect(() => {
    setActiveMenu(null);
    setMobileOpen(false);
  }, [pathname]);

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
        className={`sticky top-0 z-50 transition-all duration-200 ${
          scrolled ? "border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="marketing-container" ref={menuRef}>
          <div className="flex min-h-[72px] items-center justify-between gap-4">
            {/* Logo */}
            <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Fauward home">
              <span className="inline-flex w-[46px]">
                <BrandLogo variant="mark" priority />
              </span>
              <span className="hidden text-lg font-bold text-brand-navy sm:block">Fauward</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
              {navItems.map((item) => {
                if (item.mega) {
                  const isOpen = activeMenu === item.label;
                  return (
                    <div key={item.label} className="relative">
                      <button
                        type="button"
                        onClick={() => setActiveMenu(isOpen ? null : item.label)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-gray-100 hover:text-brand-navy ${
                          isOpen ? "bg-gray-100 text-brand-navy" : "text-gray-700"
                        }`}
                      >
                        {item.label}
                        <ChevronDown
                          size={14}
                          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {isOpen && (
                        <MegaMenuPanel
                          columns={item.mega.columns}
                          onClose={() => setActiveMenu(null)}
                        />
                      )}
                    </div>
                  );
                }
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className={`relative inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-gray-100 hover:text-brand-navy ${
                      isActive ? "text-brand-navy" : "text-gray-700"
                    }`}
                  >
                    {item.label}
                    {isActive && (
                      <span className="absolute -bottom-0.5 left-3 right-3 h-0.5 rounded-full bg-amber-600" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Desktop CTAs */}
            <div className="hidden items-center gap-3 lg:flex">
              <Link
                href="/login"
                className="text-sm font-medium text-gray-700 transition hover:text-brand-navy"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={`inline-flex h-10 items-center justify-center rounded-lg bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700 ${pulsing ? "cta-pulse" : ""}`}
              >
                Start Free Trial
              </Link>
            </div>

            {/* Mobile toggle */}
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

          {/* Mobile menu */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out lg:hidden ${mobileOpen ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}
          >
            <div className="border-t border-gray-200 py-3">
              <nav className="flex flex-col gap-0.5" aria-label="Mobile navigation">
                {navItems.map((item) => {
                  if (item.mega) {
                    return (
                      <div key={item.label}>
                        <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-400">{item.label}</p>
                        {item.mega.columns.flatMap((col) =>
                          col.items.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={() => setMobileOpen(false)}
                              className="inline-flex min-h-[44px] items-center gap-2 rounded-md px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <link.icon size={15} className="text-gray-400" />
                              {link.label}
                            </Link>
                          ))
                        )}
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={item.href}
                      href={item.href!}
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex min-h-[44px] items-center rounded-md px-3 text-base font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {item.label}
                    </Link>
                  );
                })}
                <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-3">
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
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-amber-600 px-6 font-semibold text-white hover:bg-amber-700"
                  >
                    Start Free Trial
                  </Link>
                </div>
              </nav>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
