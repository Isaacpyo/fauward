import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { StepBranding } from "@/components/onboarding/StepBranding";
import { StepFirstShipment } from "@/components/onboarding/StepFirstShipment";
import { StepGoLive } from "@/components/onboarding/StepGoLive";
import { StepInviteTeam } from "@/components/onboarding/StepInviteTeam";
import { StepPayments } from "@/components/onboarding/StepPayments";
import {
  initialOnboardingState,
  type OnboardingState
} from "@/components/onboarding/types";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/layouts/PageShell";
import { queryClient } from "@/lib/queryClient";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";
import { applyTenantConfig } from "@/theme/tenant";
import type { TenantConfig } from "@/types/domain";

const stepLabels = [
  "Brand Your Platform",
  "Create First Shipment",
  "Invite Team",
  "Connect Payments",
  "Go Live"
];

export function OnboardingPage() {
  const tenant = useTenantStore((state) => state.tenant);
  const setTenant = useTenantStore((state) => state.setTenant);
  const setAppTenant = useAppStore((state) => state.setTenant);
  const setDashboardChecklistDismissed = useAppStore((state) => state.setDashboardChecklistDismissed);
  const addToast = useAppStore((state) => state.addToast);
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>(initialOnboardingState);

  useEffect(() => {
    if (tenant?.name && !state.companyName) {
      setState((current) => ({ ...current, companyName: tenant.name }));
    }
  }, [state.companyName, tenant?.name]);

  const next = () => setStep((current) => Math.min(stepLabels.length - 1, current + 1));
  const back = () => setStep((current) => Math.max(0, current - 1));

  const complete = () => {
    const nextTenant: TenantConfig = tenant
      ? {
          ...tenant,
          onboarding_complete: true,
          name: state.companyName || tenant.name,
          primary_color: state.primaryColor,
          logo_url: state.logoPreview || tenant.logo_url
        }
      : {
          tenant_id: "tenant_demo",
          name: state.companyName || "Fauward Demo Tenant",
          logo_url: state.logoPreview || "",
          domain: "demo.fauward.com",
          primary_color: state.primaryColor,
          accent_color: "#D97706",
          locale: "en-GB",
          rtl: false,
          currency: "GBP",
          timezone: "Europe/London",
          onboarding_complete: true,
          support_email: "support@fauward.com",
          support_phone: "+44 20 7946 0000"
        };

    setTenant(nextTenant);
    setAppTenant(nextTenant);
    queryClient.setQueryData(["tenant-config"], nextTenant);
    applyTenantConfig(nextTenant);
    setDashboardChecklistDismissed(false);
    addToast({ title: "Onboarding complete. Welcome live!", variant: "success" });
    navigate("/", { replace: true });
  };

  return (
    <PageShell
      title="Tenant Onboarding"
      description="Set up your tenant in a few guided steps."
    >
      <div className="space-y-4">
        <OnboardingStepper currentStep={step} labels={stepLabels} />

        {step === 0 ? <StepBranding state={state} onChange={setState} /> : null}
        {step === 1 ? <StepFirstShipment state={state} onChange={setState} onSkip={next} /> : null}
        {step === 2 ? <StepInviteTeam state={state} onChange={setState} onSkip={next} /> : null}
        {step === 3 ? <StepPayments state={state} onChange={setState} onSkip={next} /> : null}
        {step === 4 ? <StepGoLive state={state} onComplete={complete} /> : null}

        {step < 4 ? (
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" onClick={back} disabled={step === 0}>
              Back
            </Button>
            <Button onClick={next}>
              {step === 3 ? "Almost there!" : "Continue"}
            </Button>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
