'use client';

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Cpu,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  Bell,
  Link2,
  ArrowRight,
} from "lucide-react";

import AgentAppShowcase from "@/components/marketing/AgentAppShowcase";
import { AGENT_CAPABILITIES } from "@/lib/marketing-data";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const ICON_MAP: Record<string, typeof Cpu> = {
  cpu: Cpu,
  "alert-triangle": AlertTriangle,
  "message-square": MessageSquare,
  "trending-up": TrendingUp,
  bell: Bell,
  link: Link2,
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

export default function AgentSection() {
  return (
    <section className="relative overflow-hidden bg-[#0d1f3c] py-20 lg:py-28">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
      {/* Glow orbs */}
      <motion.div
        className="pointer-events-none absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-amber-500/15 blur-3xl"
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -left-20 bottom-1/4 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        aria-hidden
      />

      <div className="marketing-container relative">
        {/* Header */}
        <motion.div
          className="mx-auto max-w-3xl text-center"
          variants={headerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          <motion.div variants={headerItem} className="mb-4 inline-block">
            <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              <span className="relative z-10">Fauward Agent — Now Available</span>
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ x: "-120%" }}
                animate={{ x: "120%" }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                style={{
                  background:
                    "linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.4) 50%, transparent 65%, transparent 100%)",
                }}
              />
            </span>
          </motion.div>

          <motion.h2
            variants={headerItem}
            className="text-3xl font-bold leading-tight text-white md:text-4xl lg:text-5xl"
          >
            Delegate operations to an agent that{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400 bg-clip-text text-transparent">
                stays in your control
              </span>
              <motion.span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400"
                initial={{ width: 0 }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 1, delay: 0.5, ease: EASE }}
              />
            </span>
          </motion.h2>

          <motion.p variants={headerItem} className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-blue-200/90">
            Fauward Agent monitors shipments, flags exceptions, suggests actions, and automates approved workflows — with your dispatchers staying in the loop at every step.
          </motion.p>

          <motion.div variants={headerItem} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <MotionLink
              href="/agent"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-lg bg-amber-500 px-7 text-base font-semibold text-gray-900 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)]"
            >
              <span className="relative z-10 inline-flex items-center gap-2">
                Explore Fauward Agent
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </span>
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.7, ease: EASE }}
                style={{
                  background:
                    "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)",
                }}
              />
            </MotionLink>
            <MotionLink
              href="/signup"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-7 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/10"
            >
              Start Free Trial
            </MotionLink>
          </motion.div>
        </motion.div>

        {/* Agent app screens */}
        <div className="relative mt-20">
          <AgentAppShowcase />
        </div>

        {/* Capabilities grid */}
        <div className="mt-20 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AGENT_CAPABILITIES.map((cap, i) => {
            const Icon = ICON_MAP[cap.icon] ?? Cpu;
            return (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
                whileHover={{ y: -4 }}
                className="group rounded-xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-amber-500/40 hover:bg-amber-500/[0.06]"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 transition group-hover:bg-amber-500/25">
                  <Icon size={20} />
                </div>
                <h3 className="mb-1.5 text-sm font-bold text-white">{cap.title}</h3>
                <p className="text-xs leading-relaxed text-blue-200/70">{cap.description}</p>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-12 text-center text-xs text-blue-400">
          Available on Pro and Enterprise plans · No extra setup · Works with your existing Fauward account
        </p>
      </div>
    </section>
  );
}
