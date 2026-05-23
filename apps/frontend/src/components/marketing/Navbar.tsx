"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Menu,
  X,
  ChevronDown,
  Package,
  Map,
  FileText,
  Briefcase,
  Info,
  Newspaper,
  Headphones,
  Bot,
  LayoutGrid,
  Smartphone,
  Code,
  MapPin,
  Users,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import BrandLogo from "@/components/marketing/BrandLogo";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

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
          heading: "All products",
          items: [
            { href: "/features/shipment-management", label: "Shipment Ops",        description: "End-to-end lifecycle tracking",      icon: Package },
            { href: "/customer-tracking",            label: "Customer Tracking",   description: "Branded links, no login needed",     icon: MapPin },
            { href: "/fauward-go",                   label: "Fauward Go",          description: "Field operator PWA, offline-first",  icon: Smartphone },
            { href: "/features/finance",             label: "Finance & Invoicing", description: "Auto-invoice on delivery",           icon: FileText },
            { href: "/agent",                        label: "Fauward Agent",       description: "Ops monitoring and automation",      icon: Bot },
            { href: "/features/api-integrations",    label: "API & Integrations",  description: "REST, webhooks, carrier connect",    icon: Code },
            { href: "/features/white-label",         label: "White-Label",         description: "Your brand, your domain",            icon: Map },
            { href: "/features",                     label: "All Features",        description: "Full platform overview",             icon: LayoutGrid },
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
            { href: "/services#courier-startups",   label: "Courier Startups",   description: "Launch in an afternoon",          icon: Package },
            { href: "/services#freight-operators",  label: "Freight Operators",  description: "Multi-depot operations",          icon: Briefcase },
            { href: "/services#3pl-providers",      label: "3PL Providers",      description: "White-label for your clients",    icon: LayoutGrid },
            { href: "/services#enterprise-fleets",  label: "Enterprise Fleets",  description: "SSO, SLA, scale",                 icon: Map },
          ],
        },
        {
          heading: "Regions",
          items: [
            { href: "/services",       label: "Our Services",   description: "Everything we offer",                  icon: Briefcase },
            { href: "/regions/uk",     label: "UK & Europe",    description: "UK & EU carriers, GoCardless, VAT",     icon: Map },
            { href: "/regions/africa", label: "Africa",         description: "M-Pesa, Paystack integration-ready",    icon: Map },
            { href: "/regions/asia",   label: "Asia",           description: "COD, Aramex, Checkout.com",             icon: Map },
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
          heading: "About",
          items: [
            { href: "/about",    label: "About Us",       description: "Our story and team",                  icon: Info },
            { href: "/news",     label: "News",           description: "Product updates and insights",        icon: Newspaper },
            { href: "/careers",  label: "Careers",        description: "Build logistics infrastructure",      icon: Users },
          ],
        },
        {
          heading: "Help",
          items: [
            { href: "/docs",             label: "Docs",           description: "Developer and tenant documentation", icon: Code },
            { href: "/support",          label: "Help Centre",    description: "Guides and FAQs",                    icon: Headphones },
            { href: "/support#contact",  label: "Contact",        description: "Reach our team",                     icon: Headphones },
          ],
        },
      ],
    },
  },
  { href: "/pricing", label: "Pricing" },
];

function MegaMenuPanel({
  columns,
  onClose,
  pathname,
}: {
  columns: Array<{ heading: string; items: MegaMenuItem[] }>;
  onClose: () => void;
  pathname: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="absolute left-1/2 top-full z-50 mt-2 w-[760px] max-w-[96vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-200/60 ring-1 ring-gray-100"
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-px -z-10 rounded-2xl"
        style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.15) 0%, transparent 50%, rgba(59,130,246,0.15) 100%)" }}
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="grid gap-1 p-4" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((col, ci) => {
          const singleColumn = columns.length === 1;
          return (
          <div key={col.heading} className="px-2 py-2">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{col.heading}</p>
            <ul className={`${singleColumn ? "grid grid-cols-2 gap-x-2 gap-y-0.5" : "space-y-0.5"}`}>
              {col.items.map((item, ii) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <motion.li
                    key={item.href}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + ci * 0.06 + ii * 0.035, duration: 0.3, ease: EASE }}
                  >
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-amber-50 ${
                        isActive ? "bg-amber-50" : ""
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition group-hover:bg-amber-100 group-hover:text-amber-700 ${
                          isActive ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <Icon size={16} />
                      </span>
                      <span>
                        <span className={`block text-sm font-semibold transition group-hover:text-amber-700 ${isActive ? "text-amber-700" : "text-gray-800"}`}>
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-gray-500">{item.description}</span>
                      </span>
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-gray-100 bg-gradient-to-br from-amber-50 to-orange-50 px-6 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-amber-500" />
          <p className="text-xs font-medium text-amber-900">First shipment live in under 10 minutes — no engineer required.</p>
        </div>
        <MotionLink
          href="/signup"
          onClick={onClose}
          whileHover={{ y: -1, scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="group relative inline-flex h-9 items-center gap-1.5 overflow-hidden rounded-lg bg-amber-500 px-4 text-xs font-semibold text-gray-900 shadow shadow-amber-500/30"
        >
          <span className="relative z-10 inline-flex items-center gap-1.5">
            Start Free Trial
            <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
          </span>
          <motion.span
            aria-hidden
            className="absolute inset-0 -z-0"
            initial={{ x: "-100%" }}
            whileHover={{ x: "100%" }}
            transition={{ duration: 0.6, ease: EASE }}
            style={{ background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)" }}
          />
        </MotionLink>
      </div>
    </motion.div>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    setActiveMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-gray-200/80 bg-white/80 shadow-sm backdrop-blur-xl"
          : "border-b border-transparent bg-slate-50/70 backdrop-blur-md"
      }`}
    >
      <div className="marketing-container" ref={menuRef}>
        <div className="flex min-h-[72px] items-center justify-between gap-4">
          {/* Logo */}
          <MotionLink
            href="/"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            className="inline-flex items-center gap-2.5"
            aria-label="Fauward home"
          >
            <span className="inline-flex w-[46px]">
              <BrandLogo variant="mark" priority />
            </span>
            <span className="hidden text-lg font-bold text-brand-navy sm:block">Fauward</span>
          </MotionLink>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
            {navItems.map((item) => {
              if (item.mega) {
                const isOpen = activeMenu === item.label;
                const isActive = item.mega.columns.some((col) =>
                  col.items.some((link) => pathname === link.href || pathname.startsWith(link.href + "/")),
                );
                return (
                  <div key={item.label} className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveMenu(isOpen ? null : item.label)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-gray-100 hover:text-brand-navy ${
                        isOpen || isActive ? "bg-gray-100 text-brand-navy" : "text-gray-700"
                      }`}
                    >
                      {item.label}
                      <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25 }}>
                        <ChevronDown size={14} />
                      </motion.span>
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <MegaMenuPanel
                          columns={item.mega.columns}
                          pathname={pathname}
                          onClose={() => setActiveMenu(null)}
                        />
                      )}
                    </AnimatePresence>
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
                    <motion.span
                      layoutId="nav-active-underline"
                      className="absolute -bottom-0.5 left-3 right-3 h-0.5 rounded-full bg-amber-500"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-brand-navy"
            >
              Log in
            </Link>
            <MotionLink
              href="/signup"
              whileHover={{ y: -1, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className="group relative inline-flex h-10 items-center gap-1.5 overflow-hidden rounded-lg bg-amber-500 px-5 text-sm font-semibold text-gray-900 shadow-[0_8px_20px_-6px_rgba(245,158,11,0.6)]"
            >
              <span className="relative z-10 inline-flex items-center gap-1.5">
                Start Free Trial
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.6, ease: EASE }}
                style={{ background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)" }}
              />
            </MotionLink>
          </div>

          {/* Mobile toggle */}
          <motion.button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            whileTap={{ scale: 0.94 }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 shadow-sm lg:hidden"
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={mobileOpen ? "x" : "menu"}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence initial={false}>
          {mobileOpen && (
            <motion.div
              key="mobile-menu"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden lg:hidden"
            >
              <div className="border-t border-gray-200 py-3">
                <nav className="flex flex-col gap-0.5" aria-label="Mobile navigation">
                  {navItems.map((item, ii) => {
                    if (item.mega) {
                      return (
                        <motion.div
                          key={item.label}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.05 + ii * 0.04, duration: 0.3 }}
                        >
                          <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-400">{item.label}</p>
                          {item.mega.columns.flatMap((col) =>
                            col.items.map((link) => {
                              const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
                              return (
                                <Link
                                  key={link.href}
                                  href={link.href}
                                  onClick={() => setMobileOpen(false)}
                                  className={`inline-flex min-h-[44px] w-full items-center gap-2 rounded-md px-4 text-sm font-medium transition hover:bg-amber-50 ${
                                    isActive ? "bg-amber-50 text-amber-700" : "text-gray-700"
                                  }`}
                                >
                                  <link.icon size={15} className={isActive ? "text-amber-600" : "text-gray-400"} />
                                  {link.label}
                                </Link>
                              );
                            }),
                          )}
                        </motion.div>
                      );
                    }
                    return (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 + ii * 0.04, duration: 0.3 }}
                      >
                        <Link
                          href={item.href!}
                          onClick={() => setMobileOpen(false)}
                          className="inline-flex min-h-[44px] w-full items-center rounded-md px-3 text-base font-medium text-gray-700 hover:bg-gray-50"
                        >
                          {item.label}
                        </Link>
                      </motion.div>
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
                    <MotionLink
                      href="/signup"
                      onClick={() => setMobileOpen(false)}
                      whileTap={{ scale: 0.97 }}
                      className="group relative inline-flex min-h-[44px] items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-amber-500 px-6 font-semibold text-gray-900 shadow-[0_8px_20px_-6px_rgba(245,158,11,0.5)]"
                    >
                      <span className="relative z-10 inline-flex items-center gap-1.5">
                        Start Free Trial
                        <ArrowRight size={16} />
                      </span>
                    </MotionLink>
                  </div>
                </nav>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}
