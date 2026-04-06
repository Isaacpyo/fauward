import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "destructive"
  | "amber";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
};

const variantMap: Record<ButtonVariant, string> = {
  primary: "bg-tenant-primary text-white hover:bg-[var(--tenant-primary-hover)]",
  secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
  ghost: "text-gray-700 hover:bg-gray-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  amber: "bg-amber-600 text-white hover:bg-amber-700"
};

const sizeMap: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-base"
};

export function Button({
  asChild,
  className,
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  icon,
  loading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const isDisabled = Boolean(disabled || loading);
  const classes = cn(
    "inline-flex min-w-fit items-center justify-center gap-2 rounded-md font-semibold transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary-light)]",
    "disabled:cursor-not-allowed disabled:opacity-60",
    variantMap[variant],
    sizeMap[size],
    className
  );

  if (asChild) {
    return (
      <Comp className={classes} {...props}>
        {children}
      </Comp>
    );
  }

  return (
    <Comp
      className={classes}
      disabled={isDisabled}
      {...props}
    >
      {leftIcon ?? icon}
      {loading ? "Loading..." : children}
      {rightIcon}
    </Comp>
  );
}
