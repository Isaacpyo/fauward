import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export function Input({ className = "", error, ...props }: InputProps) {
  return (
    <div className="w-full">
      <input
        {...props}
        className={`h-14 w-full rounded-xl border border-[var(--border-color)] bg-white px-4 text-base text-gray-900 placeholder:text-gray-500 ${className}`}
      />
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

