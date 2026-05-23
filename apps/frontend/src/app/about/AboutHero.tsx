"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

export default function AboutHero() {
  return (
    <section className="relative overflow-hidden bg-[#0d1f3c] py-20 lg:py-28">
      <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
      <motion.div
        className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-500/15 blur-3xl"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute right-0 bottom-0 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"
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
              <span className="relative z-10">About Us</span>
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
            We build software for the people who{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400 bg-clip-text text-transparent">
                keep things moving
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
            Fauward was built by logistics operators who spent years frustrated by software that wasn&apos;t built for the realities of running freight and courier businesses. We decided to fix it.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
