"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

export default function ServicesHero() {
  return (
    <section className="relative overflow-hidden bg-[#0d1f3c] py-20 lg:py-28">
      <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
      <motion.div
        className="pointer-events-none absolute right-0 top-0 h-96 w-96 -translate-y-1/4 translate-x-1/4 rounded-full bg-amber-500/15 blur-3xl"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"
        animate={{ opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        aria-hidden
      />

      <div className="marketing-container relative">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          variants={container}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={item} className="mb-4 inline-block">
            <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-300">
              <Sparkles size={12} />
              <span className="relative z-10">Services</span>
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

          <motion.h1 variants={item} className="text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
            Everything your logistics business needs,{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400 bg-clip-text text-transparent">
                under one roof
              </span>
              <motion.span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400"
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 1, delay: 0.7, ease: EASE }}
              />
            </span>
          </motion.h1>

          <motion.p variants={item} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-blue-200/90">
            From shipment lifecycle management to AI-powered dispatch, Fauward gives operators, drivers, finance teams, and customers one coherent platform.
          </motion.p>

          <motion.div variants={item} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <MotionLink
              href="/signup"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-lg bg-amber-500 px-8 text-base font-semibold text-gray-900 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)]"
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
              href="/pricing"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex h-12 items-center rounded-lg border border-white/20 bg-white/5 px-8 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/10"
            >
              View Pricing
            </MotionLink>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
