"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles, Zap } from "lucide-react";

import BrandLogo from "@/components/marketing/BrandLogo";
import SignupForm from "@/components/marketing/SignupForm";
import { VALUE_PROP_BULLETS } from "@/lib/marketing-data";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 16, filter: "blur(8px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE } },
};

export default function SignupPageContent() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-slate-50 py-12 lg:py-16">
      <div className="absolute inset-0 -z-10 bg-grid opacity-60" aria-hidden />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-1/4 -z-10 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl"
        animate={{ opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-1/4 -z-10 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl"
        animate={{ opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <div className="marketing-container">
        <motion.div
          className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {/* Signup form panel */}
          <motion.div
            variants={item}
            className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-xl lg:p-10"
          >
            <motion.div variants={item} className="mb-4 inline-block">
              <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                <Sparkles size={12} className="text-amber-500" />
                <span className="relative z-10">Start your free trial</span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                  style={{ background: "linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.85) 50%, transparent 65%, transparent 100%)" }}
                />
              </span>
            </motion.div>

            <motion.h1 variants={item} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl lg:text-5xl">
              Launch your branded{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                  logistics platform
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-600 to-orange-500"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, delay: 0.6, ease: EASE }}
                />
              </span>
            </motion.h1>

            <motion.p variants={item} className="mt-4 text-lg leading-relaxed text-gray-600">
              Set up your account and continue to onboarding to take your first live shipment in under 10 minutes.
            </motion.p>

            <motion.div variants={item} className="mt-8">
              <SignupForm />
            </motion.div>
          </motion.div>

          {/* Pitch / value props panel */}
          <motion.aside
            variants={item}
            className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 shadow-sm lg:p-10"
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -inset-px -z-10 rounded-3xl"
              style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, transparent 50%, rgba(59,130,246,0.18) 100%)" }}
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <span aria-hidden className="absolute inset-0 -z-[5] rounded-3xl bg-white" />
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -top-20 -right-20 -z-[5] h-64 w-64 rounded-full bg-amber-400/30 blur-3xl"
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />

            <motion.div variants={item} className="mb-6 w-[180px]">
              <BrandLogo variant="lockup" />
            </motion.div>

            <motion.h2 variants={item} className="text-2xl font-bold leading-tight text-gray-900">
              What you get{" "}
              <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                from day one
              </span>
            </motion.h2>

            <motion.ul variants={item} className="mt-6 space-y-3.5">
              {VALUE_PROP_BULLETS.map((bullet, i) => (
                <motion.li
                  key={bullet}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.07, duration: 0.5, ease: EASE }}
                  className="flex items-start gap-2.5 text-base text-gray-700"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {bullet}
                </motion.li>
              ))}
            </motion.ul>

            {/* Trust strip */}
            <motion.div variants={item} className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
                  <Zap size={16} />
                </span>
                <div>
                  <div className="text-sm font-bold text-amber-900">Live in 10 minutes</div>
                  <div className="mt-1 text-xs leading-relaxed text-amber-800/80">
                    Sign up, brand your portal, invite your team, and take your first booking — all in one afternoon.
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div variants={item} className="mt-6">
              <MotionLink
                href="/pricing"
                initial="rest"
                animate="rest"
                whileHover="hover"
                className="relative inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg border px-5 text-sm font-semibold shadow-sm"
                variants={{
                  rest:  { borderColor: "#d1d5db", color: "#111827" },
                  hover: { borderColor: "#b45309", color: "#ffffff" },
                }}
                transition={{ duration: 0.3 }}
              >
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ y: "100%" }}
                whileHover={{ y: "0%" }}
                transition={{ duration: 0.4, ease: EASE }}
                style={{ background: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)" }}
              />
                <span className="relative z-10 inline-flex items-center gap-2">
                  View pricing plans
                  <ArrowRight size={14} />
                </span>
              </MotionLink>
            </motion.div>

            <motion.p variants={item} className="mt-4 text-center text-xs text-gray-500">
              Already have a workspace?{" "}
              <Link href="/login" className="font-semibold text-amber-700 underline-offset-4 hover:underline">
                Sign in
              </Link>
            </motion.p>
          </motion.aside>
        </motion.div>
      </div>
    </section>
  );
}
