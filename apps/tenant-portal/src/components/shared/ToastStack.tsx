import { useEffect } from "react";

import { useAppStore } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";

export function ToastStack() {
  const toasts = useAppStore((state) => state.toasts);
  const dismissToast = useAppStore((state) => state.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismissToast(toast.id), 3500)
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismissToast, toasts]);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[1300] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm",
            toast.variant === "success" ? "border-green-300" : "",
            toast.variant === "warning" ? "border-amber-300" : "",
            toast.variant === "error" ? "border-red-300" : ""
          )}
        >
          <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
          {toast.description ? <p className="mt-1 text-sm text-gray-600">{toast.description}</p> : null}
        </div>
      ))}
    </div>
  );
}
