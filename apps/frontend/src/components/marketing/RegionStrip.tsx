'use client';

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { REGIONS } from "@/lib/marketing-data";

const REGION_FLAGS: Record<string, string> = {
  uk: "🇬🇧",
  africa: "🌍",
  asia: "🌏",
  global: "🌐",
};

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

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

const cardEntrance = (index: number) => ({
  hidden: { opacity: 0, y: 40, scale: 0.95, filter: "blur(10px)" },
  show:   {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.7, delay: index * 0.12, ease: EASE },
  },
});

export default function RegionStrip() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container">
        <motion.div
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          variants={headerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          <div>
            <motion.h2
              variants={headerItem}
              className="text-3xl font-semibold leading-tight text-gray-900 md:text-4xl"
            >
              Built for{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                  UK, Africa, Asia
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
              , and global teams
            </motion.h2>
            <motion.p variants={headerItem} className="mt-3 max-w-3xl text-lg text-gray-600">
              Launch consistent tenant operations across regions while keeping local workflows and compliance needs in view.
            </motion.p>
          </div>
          <motion.div variants={headerItem}>
            <Link
              href="/regions/global"
              className="group inline-flex items-center gap-1 text-sm font-semibold text-brand-navy underline-offset-4 hover:underline"
            >
              Explore regions
              <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </motion.div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {REGIONS.map((region, index) => (
            <motion.div
              key={region.slug}
              variants={cardEntrance(index)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.25 }}
            >
              <MotionLink
                href={`/regions/${region.slug}`}
                initial="rest"
                animate="rest"
                whileHover="hover"
                className="group relative isolate flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-6"
              >
                {/* Animated amber gradient overlay sliding from bottom */}
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-10"
                  variants={{
                    rest:  { y: "100%", opacity: 0 },
                    hover: { y: "0%",   opacity: 1 },
                  }}
                  transition={{ duration: 0.45, ease: EASE }}
                  style={{ background: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)" }}
                />
                {/* Soft glow at top edge of overlay */}
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 -top-1 -z-10 h-32 blur-2xl"
                  variants={{
                    rest:  { opacity: 0 },
                    hover: { opacity: 0.55 },
                  }}
                  transition={{ duration: 0.45 }}
                  style={{ background: "rgba(245, 158, 11, 0.45)" }}
                />

                {/* Amber left border that slides in (kept from original, layered over overlay) */}
                <motion.span
                  className="absolute inset-y-0 left-0 w-1 origin-top rounded-l-xl bg-amber-600"
                  variants={{
                    rest:  { scaleY: 0, opacity: 0 },
                    hover: { scaleY: 1, opacity: 1 },
                  }}
                  transition={{ duration: 0.3, ease: EASE }}
                  aria-hidden
                />

                <motion.div
                  className="inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
                  variants={{
                    rest:  { backgroundColor: "#f3f4f6", color: "#4b5563" },
                    hover: { backgroundColor: "rgba(255,255,255,0.2)", color: "#ffffff" },
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {REGION_FLAGS[region.slug] ?? ""} {region.label}
                </motion.div>

                <motion.h3
                  className="mt-4 text-xl font-semibold"
                  variants={{
                    rest:  { color: "#111827" },
                    hover: { color: "#ffffff" },
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {region.name}
                </motion.h3>

                <motion.p
                  className="mt-2 text-sm leading-relaxed"
                  variants={{
                    rest:  { color: "#4b5563" },
                    hover: { color: "rgba(255,255,255,0.9)" },
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {region.summary}
                </motion.p>

                {"badges" in region && Array.isArray(region.badges) && region.badges.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(region.badges as string[]).map((badge) => (
                      <motion.span
                        key={badge}
                        className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                        variants={{
                          rest:  { backgroundColor: "#f9fafb", borderColor: "#e5e7eb", color: "#4b5563" },
                          hover: { backgroundColor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.35)", color: "#ffffff" },
                        }}
                        transition={{ duration: 0.3 }}
                      >
                        {badge}
                      </motion.span>
                    ))}
                  </div>
                ) : null}

                <motion.span
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
                  variants={{
                    rest:  { color: "#0D1F3C" },
                    hover: { color: "#ffffff" },
                  }}
                  transition={{ duration: 0.3 }}
                >
                  View details
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
              </MotionLink>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
