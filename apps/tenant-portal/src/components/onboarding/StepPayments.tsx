import { CheckCircle2 } from "lucide-react";

import type { OnboardingState } from "@/components/onboarding/types";
import { Button } from "@/components/ui/Button";

type StepPaymentsProps = {
  state: OnboardingState;
  onChange: (state: OnboardingState) => void;
  onSkip: () => void;
};

export function StepPayments({ state, onChange, onSkip }: StepPaymentsProps) {
  const connect = async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    onChange({
      ...state,
      paymentsConnected: true,
      stripeAccountId: `acct_${Math.random().toString(36).slice(2, 10)}`
    });
  };

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Connect payments</h2>
      <p className="text-sm text-gray-600">
        Connect the tenant&apos;s own gateway credentials to collect payments from their customers.
      </p>

      {state.paymentsConnected ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-green-800">
            <CheckCircle2 size={16} />
            Tenant payment gateway connected
          </p>
          <p className="mt-1 text-xs text-green-700">Account ID: {state.stripeAccountId}</p>
        </div>
      ) : (
        <Button onClick={connect}>Connect gateway</Button>
      )}

      <button type="button" className="text-sm text-gray-600 underline" onClick={onSkip}>
        Skip - I'll set this up later
      </button>
    </section>
  );
}
