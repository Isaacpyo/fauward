'use client';

import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';

export function ReadingProgress() {
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 150,
    damping: 30,
    restDelta: 0.001,
  });

  if (reducedMotion) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-gradient-to-r from-amber-400 via-orange-500 to-amber-300"
      style={{ scaleX }}
    />
  );
}

export default ReadingProgress;
