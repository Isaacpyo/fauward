import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "primary"
  | "danger"
  | "default";

const variantMap: Record<BadgeVariant, string> = {
  neutral: "bg-gray-100 text-gray-700",
  success: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  error: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  info: "bg-[var(--color-info-light)] text-[var(--color-info)]",
  primary: "bg-[var(--tenant-primary-light)] text-[var(--tenant-primary)]",
  danger: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  default: "bg-gray-100 text-gray-700"
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        variantMap[variant],
        className
      )}
      {...props}
    />
  );
}
