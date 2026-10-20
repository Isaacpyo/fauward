'use client';

import Image from "next/image";
import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

const SCREENS = [
  {
    src: "/images/screens/fauward-agent-risks.webp",
    alt: "Fauward Agent mobile app home screen listing three shipment risks across two tenants, each with an ETA impact, a suggested action and its approval status, plus pending approvals, on-time rate and critical exceptions",
  },
  {
    src: "/images/screens/fauward-agent-risk-detail.webp",
    alt: "Fauward Agent shipment risk detail for FW-7821 showing the Manchester to Leeds route, an AI summary of M62 congestion, a recommended action to reassign to Carrier B, on-time probability, cost impact, approval SLA, driver details, a drafted customer message and an event timeline",
  },
] as const;

export default function AgentAppShowcase({ priority = false }: { priority?: boolean }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-4 lg:gap-6">
      {SCREENS.map((screen, i) => (
        <motion.div
          key={screen.src}
          className="relative"
          initial={{ opacity: 0, scale: 0.94, y: 28 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ delay: i * 0.15, duration: 0.8, ease: EASE }}
        >
          <Image
            src={screen.src}
            alt={screen.alt}
            width={1122}
            height={1402}
            sizes="(min-width: 1024px) 480px, (min-width: 640px) 45vw, 100vw"
            priority={priority && i === 0}
            className="mx-auto h-auto w-full max-w-[480px] rounded-3xl shadow-[0_28px_90px_-32px_rgba(0,0,0,0.85)]"
          />
        </motion.div>
      ))}
    </div>
  );
}
