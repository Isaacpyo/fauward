'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';

import { CommandCentreMockup } from './CommandCentreMockup';

const MotionLink = motion(Link);

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: { opacity: 0 },
  show:   {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show:   {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease: EASE },
  },
};

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);

  // Mouse-following spotlight
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.15);
  const smoothX = useSpring(mouseX, { stiffness: 120, damping: 20 });
  const smoothY = useSpring(mouseY, { stiffness: 120, damping: 20 });
  const spotlightX = useTransform(smoothX, (v) => `${v * 100}%`);
  const spotlightY = useTransform(smoothY, (v) => `${v * 100}%`);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function handleMouseMove(e: React.MouseEvent<HTMLElement>) {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  }

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      className="relative overflow-hidden bg-slate-50 py-20 lg:py-32"
    >
      {/* Light grid overlay */}
      <div className="absolute inset-0 -z-20 bg-grid" aria-hidden />

      {/* Mouse-following radial spotlight */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: useTransform(
            [spotlightX, spotlightY] as never,
            ([x, y]: string[]) =>
              `radial-gradient(600px circle at ${x} ${y}, rgba(251,191,36,0.18), rgba(59,130,246,0.10) 35%, transparent 70%)`,
          ),
        }}
      />

      {/* Static ambient glow (top) */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[600px] w-[900px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(ellipse, #bfdbfe 0%, #e0e7ff 60%, transparent 100%)' }}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 0.35, scale: 1 }}
        transition={{ duration: 1.6, ease: EASE }}
      />

      <motion.div
        className="marketing-container"
        variants={container}
        initial="hidden"
        animate={mounted ? 'show' : 'hidden'}
      >
        <div className="mx-auto max-w-3xl text-center">
          {/* Animated badge with shimmer */}
          <motion.div variants={fadeUp} className="mb-6 inline-block">
            <span className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              <span className="relative z-10 inline-flex items-center gap-2">
                <Sparkles size={12} className="text-amber-500" />
                White-label logistics SaaS — for operators, not developers
              </span>
              {/* Shimmer */}
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ x: '-120%' }}
                animate={{ x: '120%' }}
                transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.8, ease: 'easeInOut' }}
                style={{
                  background:
                    'linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.85) 50%, transparent 65%, transparent 100%)',
                }}
              />
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            className="text-4xl font-bold leading-[1.1] text-gray-900 md:text-5xl lg:text-6xl"
          >
            The logistics platform
            <br />
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                that runs itself.
              </span>
              <motion.span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-600 to-orange-500"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.1, delay: 0.7, ease: EASE }}
              />
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600"
          >
            Fully branded, all-in-one, and powered by agents that handle the ops you don&apos;t have time for.
          </motion.p>

          {/* CTAs */}
          <motion.div
            variants={fadeUp}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <MotionLink
              href="/signup"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              className="group relative inline-flex h-12 min-w-[180px] items-center justify-center gap-2 overflow-hidden rounded-lg bg-amber-500 px-6 py-3 text-base font-semibold text-gray-900 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)]"
            >
              <span className="relative z-10 inline-flex items-center gap-2">
                Start Free
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </span>
              {/* Sweep gloss */}
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ x: '-100%' }}
                whileHover={{ x: '100%' }}
                transition={{ duration: 0.7, ease: EASE }}
                style={{
                  background:
                    'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)',
                }}
              />
            </MotionLink>

            <MotionLink
              href="/support#contact"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              className="inline-flex h-12 min-w-[180px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-800 shadow-sm hover:border-gray-400"
            >
              Learn more
              <ArrowRight size={16} className="opacity-60 transition-transform group-hover:translate-x-1" />
            </MotionLink>
          </motion.div>
        </div>

        {/* Command centre mockup */}
        <motion.div
          variants={fadeUp}
          className="mx-auto mt-16 max-w-5xl"
        >
          <CommandCentreMockup />
        </motion.div>
      </motion.div>
    </section>
  );
}
