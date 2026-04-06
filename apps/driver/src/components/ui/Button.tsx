import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "outline-warning" | "outline-danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  leftIcon?: ReactNode;
};

const variantMap: Record<ButtonVariant, string> = {
  primary: "bg-[var(--tenant-primary)] text-white",
  secondary: "border border-[var(--border-color)] bg-white text-gray-700",
  danger: "bg-[var(--color-error)] text-white",
  success: "bg-[var(--color-success)] text-white",
  "outline-warning": "border border-amber-300 bg-white text-amber-800",
  "outline-danger": "border border-red-300 bg-white text-red-700"
};

export function Button({ variant = "primary", leftIcon, className = "", children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold ${variantMap[variant]} ${className}`}
    >
      {leftIcon}
      {children}
    </button>
  );
}

