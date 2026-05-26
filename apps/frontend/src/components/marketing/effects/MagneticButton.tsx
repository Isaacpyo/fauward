'use client';

import Link from 'next/link';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { useRef } from 'react';

type SharedProps = {
  children: ReactNode;
  className?: string;
  strength?: number;
  block?: boolean;
};

type AnchorProps = SharedProps & {
  href: string;
  target?: string;
  rel?: string;
  prefetch?: boolean;
};

type ButtonProps = SharedProps & {
  href?: undefined;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  disabled?: boolean;
  ariaLabel?: string;
};

type MagneticButtonProps = AnchorProps | ButtonProps;

export function MagneticButton(props: MagneticButtonProps) {
  const { children, className, strength = 0.25, block = false } = props;
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  const xRaw = useMotionValue(0);
  const yRaw = useMotionValue(0);
  const x = useSpring(xRaw, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(yRaw, { stiffness: 220, damping: 18, mass: 0.4 });

  function handleMove(e: MouseEvent<HTMLSpanElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - (rect.left + rect.width / 2);
    const offsetY = e.clientY - (rect.top + rect.height / 2);
    xRaw.set(offsetX * strength);
    yRaw.set(offsetY * strength);
  }

  function handleLeave() {
    xRaw.set(0);
    yRaw.set(0);
  }

  const inner = isAnchor(props) ? (
    <Link
      href={props.href}
      className={className}
      target={props.target}
      rel={props.rel}
      prefetch={props.prefetch}
    >
      {children}
    </Link>
  ) : (
    <button
      type={props.type ?? 'button'}
      className={className}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
    >
      {children}
    </button>
  );

  if (reducedMotion) return inner;

  return (
    <motion.span
      ref={ref}
      style={{ x, y, display: block ? 'block' : 'inline-block' }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {inner}
    </motion.span>
  );
}

function isAnchor(props: MagneticButtonProps): props is AnchorProps {
  return typeof (props as AnchorProps).href === 'string';
}

export default MagneticButton;
