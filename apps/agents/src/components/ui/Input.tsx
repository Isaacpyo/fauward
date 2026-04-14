import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export function Input({ className = "", error, ...props }: InputProps) {
  return (
    <div className="w-full">
      <input
        {...props}
        className={`h-11 w-full rounded-lg border border-[var(--border-color)] bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-[var(--tenant-primary)] focus:outline-none ${className}`}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}