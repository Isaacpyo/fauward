import type { TextareaHTMLAttributes } from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: string;
};

export function Textarea({ className = "", error, ...props }: TextareaProps) {
  return (
    <div className="w-full">
      <textarea
        {...props}
        className={`min-h-[120px] w-full rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-[var(--tenant-primary)] focus:outline-none ${className}`}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}