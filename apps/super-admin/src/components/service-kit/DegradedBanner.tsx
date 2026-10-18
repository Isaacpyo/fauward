import type { ReactNode } from "react";

type Variant = "vendor-unconfigured" | "vendor-error" | "not-wired" | "preview";

const TITLES: Record<Variant, string> = {
  "vendor-unconfigured": "Vendor not configured",
  "vendor-error": "Vendor error",
  "not-wired": "Not wired yet",
  preview: "Preview"
};

/** Names what is degraded and the env var or work package that fixes it (service kit §6.2). */
export function DegradedBanner({ variant, fixedBy, children }: { variant: Variant; fixedBy: string; children: ReactNode }) {
  return (
    <div role="note" data-testid={`degraded-${variant}`} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">
        {TITLES[variant]} <span className="font-mono text-xs font-normal">({fixedBy})</span>
      </p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
