'use client';

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Package,
  Briefcase,
  LayoutGrid,
  Map,
  Check,
  Zap,
  ArrowRight,
  Shield,
  Activity,
  Building2,
  Truck,
  Box,
  type LucideIcon,
} from "lucide-react";

import { BUSINESS_SOLUTIONS, type BusinessSolution } from "@/lib/marketing-data";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

type VisualConfig = {
  icon: LucideIcon;
  metric: { value: string; label: string };
  accent: { from: string; to: string; text: string; chip: string; chipBorder: string };
  visualKey: "live-counter" | "hub-spoke" | "tenant-switcher" | "governance";
};

const VISUALS: Record<string, VisualConfig> = {
  "courier-startups": {
    icon: Package,
    metric: { value: "10 min", label: "Median to first live shipment" },
    accent: {
      from: "#fffbeb",
      to: "#fef3c7",
      text: "#b45309",
      chip: "#fffbeb",
      chipBorder: "#fde68a",
    },
    visualKey: "live-counter",
  },
  "freight-operators": {
    icon: Briefcase,
    metric: { value: "Multi-depot", label: "Hub-and-spoke visibility" },
    accent: {
      from: "#eff6ff",
      to: "#dbeafe",
      text: "#1d4ed8",
      chip: "#eff6ff",
      chipBorder: "#bfdbfe",
    },
    visualKey: "hub-spoke",
  },
  "3pl-providers": {
    icon: LayoutGrid,
    metric: { value: "Unlimited", label: "Branded client tenants" },
    accent: {
      from: "#f5f3ff",
      to: "#ede9fe",
      text: "#6d28d9",
      chip: "#f5f3ff",
      chipBorder: "#ddd6fe",
    },
    visualKey: "tenant-switcher",
  },
  "enterprise-fleets": {
    icon: Map,
    metric: { value: "99.9%", label: "Uptime SLA on enterprise plans" },
    accent: {
      from: "#ecfdf5",
      to: "#d1fae5",
      text: "#047857",
      chip: "#ecfdf5",
      chipBorder: "#a7f3d0",
    },
    visualKey: "governance",
  },
};

const headerContainer = {
  hidden: { opacity: 0 },
  show:   {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.05 },
  },
};

const headerItem = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show:   {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE },
  },
};

const rowEntrance = (reverse: boolean) => ({
  hidden: { opacity: 0, x: reverse ? 40 : -40, filter: "blur(10px)" },
  show:   {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.8, ease: EASE },
  },
});

const visualEntrance = (reverse: boolean) => ({
  hidden: { opacity: 0, x: reverse ? -40 : 40, scale: 0.95, filter: "blur(10px)" },
  show:   {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.8, delay: 0.15, ease: EASE },
  },
});

/* ── Visual mockups per solution ─────────────────────────────────── */

function LiveCounterVisual({ accent }: { accent: VisualConfig["accent"] }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" /> LIVE
        </span>
        <span className="text-xs font-mono text-gray-400">app.yourbrand.com</span>
      </div>
      <div className="mt-6 text-center">
        <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">Time to first shipment</div>
        <motion.div
          className="mt-2 text-5xl font-bold"
          style={{ color: accent.text }}
          animate={{ scale: [1, 1.03, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          09:42
        </motion.div>
        <div className="mt-1 text-xs text-gray-500">After signing up — no engineer required</div>
      </div>
      <div className="mt-6 space-y-2">
        {[
          { label: "Brand + logo configured", done: true },
          { label: "First driver invited", done: true },
          { label: "First shipment created", done: true },
          { label: "Tracking link shared", done: false },
        ].map((step) => (
          <div key={step.label} className="flex items-center gap-2 text-xs">
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full ${
                step.done ? "bg-amber-500 text-white" : "border border-dashed border-gray-300"
              }`}
            >
              {step.done ? <Check size={10} strokeWidth={3} /> : null}
            </span>
            <span className={step.done ? "text-gray-700" : "text-gray-400"}>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HubSpokeVisual() {
  const spokes = [
    { x: 30, y: 20, label: "Manchester" },
    { x: 80, y: 30, label: "Leeds" },
    { x: 85, y: 75, label: "Birmingham" },
    { x: 25, y: 80, label: "Bristol" },
  ];
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-blue-700">
          <Truck size={10} /> Live network
        </span>
        <span className="text-xs font-mono text-blue-700/60">5 depots · 42 routes</span>
      </div>
      <div className="relative aspect-[5/3] w-full">
        <svg viewBox="0 0 100 60" className="absolute inset-0 h-full w-full">
          {spokes.map((s, i) => (
            <motion.line
              key={i}
              x1={50}
              y1={30}
              x2={s.x}
              y2={s.y * 0.6}
              stroke="#3b82f6"
              strokeWidth={0.3}
              strokeDasharray="1.2 1.2"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 + i * 0.15, duration: 0.7, ease: EASE }}
            />
          ))}
        </svg>
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 18 }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/40">
            <Building2 size={20} />
          </div>
          <div className="mt-1 text-center text-[10px] font-semibold text-blue-700">London Hub</div>
        </motion.div>
        {spokes.map((s, i) => (
          <motion.div
            key={s.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${s.x}%`, top: `${s.y * 0.6}%` }}
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 + i * 0.15, type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-100 text-blue-700 shadow-md">
              <Box size={12} />
            </div>
            <div className="mt-0.5 text-center text-[9px] font-medium text-blue-700">{s.label}</div>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Active", value: "127" },
          { label: "ETA on time", value: "94%" },
          { label: "Routes today", value: "42" },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-blue-100 bg-white px-2 py-1.5">
            <div className="text-sm font-bold text-blue-700">{m.value}</div>
            <div className="text-[10px] text-gray-500">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TenantSwitcherVisual() {
  const tenants = [
    { name: "Northline Freight", domain: "track.northline.io", color: "#6d28d9", initials: "NF", active: true },
    { name: "Atlas Dispatch", domain: "go.atlasdispatch.com", color: "#0ea5e9", initials: "AD" },
    { name: "Relay Fleet", domain: "ship.relayfleet.co", color: "#f59e0b", initials: "RF" },
    { name: "PortBridge", domain: "tracking.portbridge.io", color: "#16a34a", initials: "PB" },
  ];
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-purple-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
          <LayoutGrid size={10} /> Client workspaces
        </span>
        <span className="text-xs font-mono text-gray-400">4 of unlimited</span>
      </div>
      <div className="space-y-2">
        {tenants.map((t, i) => (
          <motion.div
            key={t.name}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.5, ease: EASE }}
            className={`flex items-center gap-3 rounded-lg border p-2.5 transition ${
              t.active ? "border-purple-300 bg-purple-50/50 shadow-sm" : "border-gray-200 bg-gray-50/50"
            }`}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ background: t.color }}
            >
              {t.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-900">{t.name}</div>
              <div className="truncate text-xs font-mono text-gray-500">{t.domain}</div>
            </div>
            {t.active ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                LIVE
              </span>
            ) : (
              <span className="text-[10px] text-gray-400">Active</span>
            )}
          </motion.div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-dashed border-purple-300 bg-purple-50/30 p-2.5 text-center">
        <div className="text-xs font-semibold text-purple-700">+ Add another client</div>
        <div className="text-[10px] text-purple-600/70">No additional fees, no per-seat charges</div>
      </div>
    </div>
  );
}

function GovernanceVisual() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <Shield size={10} /> Enterprise controls
        </span>
        <span className="text-xs font-mono text-emerald-700/70">99.9% SLA</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { icon: Shield, label: "SAML / SSO", status: "Enabled" },
          { icon: Activity, label: "Audit log", status: "1.2M events" },
          { icon: Briefcase, label: "Dedicated CSM", status: "Assigned" },
          { icon: Zap, label: "Priority queue", status: "< 1h response" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.5, ease: EASE }}
            className="rounded-lg border border-emerald-100 bg-white p-3"
          >
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
              <item.icon size={14} />
            </div>
            <div className="text-xs font-semibold text-gray-900">{item.label}</div>
            <div className="text-[10px] text-emerald-700">{item.status}</div>
          </motion.div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-gray-900">Uptime — last 90 days</div>
            <div className="text-[10px] text-gray-500">No incidents above P3</div>
          </div>
          <div className="text-lg font-bold text-emerald-700">99.97%</div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
          <motion.div
            className="h-full bg-emerald-500"
            initial={{ width: 0 }}
            whileInView={{ width: "99.97%" }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 1.2, ease: EASE }}
          />
        </div>
      </div>
    </div>
  );
}

function SolutionVisual({ keyName, accent }: { keyName: VisualConfig["visualKey"]; accent: VisualConfig["accent"] }) {
  switch (keyName) {
    case "live-counter":     return <LiveCounterVisual accent={accent} />;
    case "hub-spoke":        return <HubSpokeVisual />;
    case "tenant-switcher":  return <TenantSwitcherVisual />;
    case "governance":       return <GovernanceVisual />;
  }
}

/* ── Row ──────────────────────────────────────────────────────────── */

function SolutionRow({ solution, index }: { solution: BusinessSolution; index: number }) {
  const cfg = VISUALS[solution.slug];
  const reverse = index % 2 === 1;
  const Icon = cfg.icon;

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
        reverse ? "lg:[&>*:first-child]:order-2" : ""
      }`}
    >
      {/* Text */}
      <motion.div variants={rowEntrance(reverse)}>
        <div className="mb-5 inline-flex items-center gap-2">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
            style={{ background: cfg.accent.chip, borderColor: cfg.accent.chipBorder, color: cfg.accent.text }}
          >
            <Icon size={18} />
          </span>
          <span
            className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest"
            style={{
              background: cfg.accent.chip,
              borderColor: cfg.accent.chipBorder,
              color: cfg.accent.text,
            }}
          >
            {solution.audience}
          </span>
        </div>

        <h3 className="text-3xl font-bold leading-tight text-gray-900 lg:text-4xl">
          {solution.title}
        </h3>

        <p className="mt-5 text-lg leading-relaxed text-gray-600">{solution.summary}</p>

        <div className="mt-6 inline-flex items-baseline gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
          <span className="text-3xl font-bold" style={{ color: cfg.accent.text }}>
            {cfg.metric.value}
          </span>
          <span className="text-sm text-gray-500">{cfg.metric.label}</span>
        </div>

        <ul className="mt-7 space-y-2.5">
          {solution.outcomes.map((o, oi) => (
            <motion.li
              key={o}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 + oi * 0.08, duration: 0.5, ease: EASE }}
              className="flex items-start gap-2.5 text-base text-gray-700"
            >
              <span
                className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{ background: cfg.accent.text, color: "#ffffff" }}
              >
                <Check size={11} strokeWidth={3} />
              </span>
              {o}
            </motion.li>
          ))}
        </ul>

        <MotionLink
          href={`/business#${solution.slug}`}
          initial="rest"
          animate="rest"
          whileHover="hover"
          className="relative mt-8 inline-flex h-12 items-center gap-2 overflow-hidden rounded-lg border px-7 text-sm font-semibold shadow-sm"
          variants={{
            rest:  { borderColor: "#d1d5db", color: "#111827" },
            hover: { borderColor: cfg.accent.text, color: "#ffffff" },
          }}
          transition={{ duration: 0.3 }}
        >
          <motion.span
            aria-hidden
            className="absolute inset-0 -z-0"
            variants={{
              rest:  { y: "100%" },
              hover: { y: "0%" },
            }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ background: cfg.accent.text }}
          />
          <span className="relative z-10 inline-flex items-center gap-2">
            {solution.cta}
            <motion.span
              variants={{
                rest:  { x: 0 },
                hover: { x: 4 },
              }}
              transition={{ duration: 0.3 }}
            >
              <ArrowRight size={16} />
            </motion.span>
          </span>
        </MotionLink>
      </motion.div>

      {/* Visual */}
      <motion.div variants={visualEntrance(reverse)} className="relative">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-8 -z-10 rounded-3xl blur-3xl"
          style={{ background: `linear-gradient(135deg, ${cfg.accent.from}, ${cfg.accent.to})` }}
          animate={{ opacity: [0.55, 0.85, 0.55] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <SolutionVisual keyName={cfg.visualKey} accent={cfg.accent} />
      </motion.div>
    </motion.div>
  );
}

export default function BusinessSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="marketing-container">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          variants={headerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          <motion.div variants={headerItem} className="mb-4 inline-block">
            <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              <span className="relative z-10">Business Solutions</span>
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ x: "-120%" }}
                animate={{ x: "120%" }}
                transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                style={{
                  background:
                    "linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.85) 50%, transparent 65%, transparent 100%)",
                }}
              />
            </span>
          </motion.div>
          <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
            Built for every type of{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                logistics operation
              </span>
              <motion.span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-600 to-orange-500"
                initial={{ width: 0 }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 1, delay: 0.5, ease: EASE }}
              />
            </span>
          </motion.h2>
          <motion.p variants={headerItem} className="mt-4 text-lg text-gray-600">
            Whether you&apos;re a two-van courier startup or managing a cross-regional fleet, Fauward scales with you.
          </motion.p>
        </motion.div>

        <div className="mt-20 space-y-24 lg:space-y-32">
          {BUSINESS_SOLUTIONS.map((solution, index) => (
            <SolutionRow key={solution.slug} solution={solution} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
