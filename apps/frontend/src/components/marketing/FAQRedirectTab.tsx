"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, HelpCircle, Sparkles } from "lucide-react";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

type FAQRedirectTabProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export default function FAQRedirectTab({
  eyebrow = "FAQs",
  title = "Have more questions?",
  description = "Browse the full FAQ in our Help Centre — answers on onboarding, billing, integrations, and more.",
  ctaLabel = "Visit the Help Centre",
  ctaHref = "/support#faq",
}: FAQRedirectTabProps) {
  return (
    <section className="bg-slate-50 py-16 lg:py-20">
      <div className="marketing-container">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="mx-auto max-w-3xl"
        >
          <MotionLink
            href={ctaHref}
            initial="rest"
            animate="rest"
            whileHover="hover"
            className="group relative isolate flex items-center gap-5 overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            {/* Hover gradient overlay */}
            <motion.span
              aria-hidden
              className="absolute inset-0 -z-10"
              variants={{
                rest:  { opacity: 0 },
                hover: { opacity: 1 },
              }}
              transition={{ duration: 0.45, ease: EASE }}
              style={{ background: "linear-gradient(135deg, #0d1f3c 0%, #1e3a8a 100%)" }}
            />
            {/* Soft amber halo at the top edge */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -top-20 -left-10 -z-10 h-48 w-48 rounded-full bg-amber-400/30 blur-3xl"
              variants={{
                rest:  { opacity: 0.5, scale: 0.9 },
                hover: { opacity: 0.85, scale: 1.1 },
              }}
              transition={{ duration: 0.6 }}
            />

            <motion.div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border"
              variants={{
                rest:  { backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#b45309" },
                hover: { backgroundColor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.35)", color: "#ffffff" },
              }}
              transition={{ duration: 0.3 }}
            >
              <HelpCircle size={22} />
            </motion.div>

            <div className="flex-1">
              <motion.div
                className="mb-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                variants={{
                  rest:  { backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#b45309" },
                  hover: { backgroundColor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.35)", color: "#fbbf24" },
                }}
                transition={{ duration: 0.3 }}
              >
                <Sparkles size={10} /> {eyebrow}
              </motion.div>
              <motion.h2
                className="text-lg font-bold leading-tight sm:text-xl"
                variants={{
                  rest:  { color: "#111827" },
                  hover: { color: "#ffffff" },
                }}
                transition={{ duration: 0.3 }}
              >
                {title}
              </motion.h2>
              <motion.p
                className="mt-1 text-sm leading-relaxed"
                variants={{
                  rest:  { color: "#4b5563" },
                  hover: { color: "rgba(255,255,255,0.85)" },
                }}
                transition={{ duration: 0.3 }}
              >
                {description}
              </motion.p>
            </div>

            <motion.span
              className="hidden shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm sm:inline-flex"
              variants={{
                rest:  { backgroundColor: "#f59e0b", color: "#111827" },
                hover: { backgroundColor: "#ffffff", color: "#0d1f3c" },
              }}
              transition={{ duration: 0.3 }}
            >
              {ctaLabel}
              <motion.span
                variants={{
                  rest:  { x: 0 },
                  hover: { x: 4 },
                }}
                transition={{ duration: 0.3 }}
              >
                <ArrowRight size={14} />
              </motion.span>
            </motion.span>

            {/* Mobile-only arrow indicator */}
            <motion.span
              aria-hidden
              className="shrink-0 sm:hidden"
              variants={{
                rest:  { color: "#9ca3af", x: 0 },
                hover: { color: "#ffffff",  x: 4 },
              }}
              transition={{ duration: 0.3 }}
            >
              <ArrowRight size={18} />
            </motion.span>
          </MotionLink>
        </motion.div>
      </div>
    </section>
  );
}
