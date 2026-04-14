import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  leftIcon?: ReactNode;
};

const variantMap: Record<ButtonVariant, string> = {
  primary: "bg-[var(--tenant-primary)] text-white hover:bg-[var(--tenant-primary-dark)]",
  secondary: "border border-[var(--border-color)] bg-white text-gray-700 hover:border-gray-300",
  danger: "bg-[var(--color-error)] text-white hover:bg-red-700"
};

export function Button({ variant = "primary", leftIcon, className = "", children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${variantMap[variant]} disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {leftIcon}
      {children}
    </button>
  );
}