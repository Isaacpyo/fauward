import type { TextareaHTMLAttributes } from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: string;
};

export function Textarea({ className = "", error, ...props }: TextareaProps) {
  return (
    <div className="w-full">
      <textarea
        {...props}
        className={`min-h-[112px] w-full rounded-xl border border-[var(--border-color)] bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-500 ${className}`}
      />
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

