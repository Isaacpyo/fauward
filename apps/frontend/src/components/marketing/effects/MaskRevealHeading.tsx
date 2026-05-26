'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4';

type MaskRevealHeadingProps = {
  children: ReactNode;
  as?: HeadingTag;
  className?: string;
  delay?: number;
};

export function MaskRevealHeading({
  children,
  as = 'h1',
  className,
  delay = 0,
}: MaskRevealHeadingProps) {
  const reducedMotion = useReducedMotion();
  const MotionTag = motion[as];

  if (reducedMotion) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <MotionTag
      className={className}
      initial={{ clipPath: 'inset(0 0 100% 0)', y: 12 }}
      whileInView={{ clipPath: 'inset(0 0 0% 0)', y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.85, ease: EASE, delay }}
    >
      {children}
    </MotionTag>
  );
}

export default MaskRevealHeading;
