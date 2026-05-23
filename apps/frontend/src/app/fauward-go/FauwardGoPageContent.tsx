"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  QrCode,
  WifiOff,
  Camera,
  ShieldCheck,
  MapPin,
  AlertTriangle,
  ArrowRight,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import FauwardGoSection from "@/components/marketing/FauwardGoSection";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

type TrustPoint = { icon: LucideIcon; label: string; desc: string };

const TRUST_POINTS: TrustPoint[] = [
  { icon: WifiOff,       label: "Offline-first",        desc: "Works without mobile signal. Every action queues and syncs automatically when back online." },
  { icon: QrCode,        label: "QR & barcode scanning",desc: "Scan shipment, package, or label codes at collection and delivery — no manual entry." },
  { icon: ShieldCheck,   label: "OTP confirmation",     desc: "Verify recipient identity with one-time passcodes before releasing a shipment." },
  { icon: Camera,        label: "Photo + signature",    desc: "Capture photo evidence and digital signature for every confirmation stage." },
  { icon: MapPin,        label: "GPS waypoints",        desc: "Continuous location updates during the route — visible to dispatchers in real time." },
  { icon: AlertTriangle, label: "Failed delivery flow", desc: "Capture the reason, photograph the attempt, and escalate automatically through the platform." },
];

const headerContainer = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.05 } },
};
const headerItem = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

export default function FauwardGoPageContent() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-dark-bg py-20 lg:py-28">
        <div className="absolute inset-0 -z-10 bg-dark-grid" aria-hidden />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-96 w-[640px] -translate-x-1/2 rounded-full bg-amber-500/15 blur-3xl"
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-20 bottom-0 -z-10 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"
          animate={{ opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />

        <div className="marketing-container relative">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            variants={headerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={headerItem} className="mb-5 inline-block">
              <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-300">
                <Smartphone size={12} />
                <span className="relative z-10">Fauward Go · Field Operations PWA</span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                  style={{ background: "linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.4) 50%, transparent 65%, transparent 100%)" }}
                />
              </span>
            </motion.div>

            <motion.h1
              variants={headerItem}
              className="text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl"
            >
              Every operator, every stage,{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400 bg-clip-text text-transparent">
                  fully connected
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, delay: 0.7, ease: EASE }}
                />
              </span>
              .
            </motion.h1>

            <motion.p variants={headerItem} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-blue-200/90">
              From shipment creation through warehouse intake, dispatch, pickup, linehaul, delivery, and returns — Fauward Go gives field operators the tools to collect, deliver, capture proof, and sync, even with no signal.
            </motion.p>

            <motion.div variants={headerItem} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <MotionLink
                href="/signup"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className="group relative inline-flex h-12 min-w-[200px] items-center justify-center gap-2 overflow-hidden rounded-lg bg-amber-500 px-7 text-base font-semibold text-gray-900 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)]"
              >
                <span className="relative z-10 inline-flex items-center gap-2">
                  Start Free Trial
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.7, ease: EASE }}
                  style={{ background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)" }}
                />
              </MotionLink>
              <MotionLink
                href="/support#contact"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-lg border border-white/20 bg-white/5 px-7 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/10"
              >
                Book a Demo
              </MotionLink>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Product split section (already motion via FauwardGoSection) */}
      <FauwardGoSection />

      {/* Trust signals */}
      <section className="relative overflow-hidden border-t border-gray-100 bg-slate-50 py-20 lg:py-24">
        <div className="absolute inset-0 -z-10 bg-grid opacity-50" aria-hidden />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(ellipse, #fef3c7 0%, #fed7aa 60%, transparent 100%)" }}
          animate={{ opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="marketing-container relative">
          <motion.div
            className="mx-auto mb-12 max-w-2xl text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                <Sparkles size={12} className="text-amber-500" /> Built for the field
              </span>
            </motion.div>

            <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              Built for the realities of{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                  field logistics
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

            <motion.p variants={headerItem} className="mt-4 text-base text-gray-600">
              No signal? No problem. Fauward Go handles every scenario field operators meet in the real world.
            </motion.p>
          </motion.div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST_POINTS.map(({ icon: Icon, label, desc }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 24, scale: 0.97, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: i * 0.08, duration: 0.55, ease: EASE }}
                whileHover={{ y: -4 }}
                className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-amber-200 hover:shadow-md"
              >
                <motion.div
                  whileHover={{ rotate: -4, scale: 1.06 }}
                  transition={{ type: "spring", stiffness: 320, damping: 20 }}
                  className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 shadow-sm"
                >
                  <Icon size={20} />
                </motion.div>
                <h3 className="mb-1.5 text-sm font-semibold text-gray-900">{label}</h3>
                <p className="text-xs leading-relaxed text-gray-600">{desc}</p>
              </motion.div>
            ))}
          </div>

          {/* PWA note */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="relative mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 px-8 py-6 text-center shadow-sm"
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-amber-400/30 blur-3xl"
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                <Smartphone size={11} /> Progressive Web App
              </div>
              <p className="mx-auto max-w-xl text-sm leading-relaxed text-gray-700">
                Fauward Go is a PWA — no app store approval, no install friction. Operators open it from their mobile browser and pin it to the home screen in one tap.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
