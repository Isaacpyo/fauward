import { CheckCircle2 } from "lucide-react";

import type { OnboardingState } from "@/components/onboarding/types";
import { Button } from "@/components/ui/Button";

type StepGoLiveProps = {
  state: OnboardingState;
  onComplete: () => void;
};

function ChecklistRow({ label, complete, fallback }: { label: string; complete: boolean; fallback: string }) {
  return (
    <li className="flex items-center justify-between rounded-md bg-white px-3 py-2">
      <span className="text-sm text-gray-800">{label}</span>
      {complete ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
          <CheckCircle2 size={14} />
          Done
        </span>
      ) : (
        <span className="text-xs text-gray-500">{fallback}</span>
      )}
    </li>
  );
}

export function StepGoLive({ state, onComplete }: StepGoLiveProps) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        {Array.from({ length: 16 }).map((_, index) => (
          <span
            key={index}
            className="absolute h-2 w-2 animate-bounce rounded-full bg-[var(--tenant-primary)]"
            style={{
              left: `${(index * 13) % 100}%`,
              top: `${(index * 19) % 100}%`,
              animationDelay: `${index * 90}ms`
            }}
          />
        ))}
      </div>

      <div className="relative space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Go live</h2>
        <p className="text-sm text-gray-600">Almost there! Here's what has been set up.</p>

        <ul className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <ChecklistRow label="Brand configured" complete={Boolean(state.companyName)} fallback="Set up your brand" />
          <ChecklistRow label="First shipment created" complete={state.firstShipmentCreated} fallback="Create a shipment" />
          <ChecklistRow label="Team invited" complete={state.invitedMembers.length > 0} fallback="Invite team members" />
          <ChecklistRow label="Payments connected" complete={state.paymentsConnected} fallback="Connect payment gateway" />
          <ChecklistRow label="Custom domain" complete={false} fallback="Configure domain" />
        </ul>

        <p className="text-sm text-gray-700">
          Want your own tracking domain? Set it up in Settings after launch.
        </p>

        <Button onClick={onComplete}>Go to Dashboard</Button>
      </div>
    </section>
  );
}
