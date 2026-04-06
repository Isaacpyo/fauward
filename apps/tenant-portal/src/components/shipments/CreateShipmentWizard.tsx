import { useMemo, useState } from "react";

import { StepAddresses } from "@/components/shipments/StepAddresses";
import { StepPackage } from "@/components/shipments/StepPackage";
import { StepReview } from "@/components/shipments/StepReview";
import { StepService } from "@/components/shipments/StepService";
import { ShipmentSuccessState } from "@/components/shipments/ShipmentSuccessState";
import {
  initialShipmentWizardData,
  type ShipmentWizardData
} from "@/components/shipments/wizard-types";
import { Button } from "@/components/ui/Button";

type CreateShipmentWizardProps = {
  onCreated?: (trackingNumber: string) => void;
};

const stepLabels = ["Addresses", "Package", "Service & Pricing", "Review & Confirm"];

function validateStep(step: number, data: ShipmentWizardData): string[] {
  if (step === 0) {
    const requiredFields = [
      data.pickup.line1,
      data.pickup.city,
      data.pickup.country,
      data.pickup.contactName,
      data.pickup.contactPhone,
      data.delivery.line1,
      data.delivery.city,
      data.delivery.country,
      data.delivery.contactName,
      data.delivery.contactPhone
    ];
    if (requiredFields.some((value) => !value.trim())) {
      return ["Pickup and delivery addresses with contacts are required."];
    }
  }

  if (step === 1) {
    if (!data.packageWeightKg || Number(data.packageWeightKg) <= 0) {
      return ["Package weight must be greater than zero."];
    }
    if (!data.quantity || Number(data.quantity) <= 0) {
      return ["Quantity must be at least 1."];
    }
  }

  if (step === 3 && !data.termsAccepted) {
    return ["Please accept the review confirmation checkbox."];
  }

  return [];
}

export function CreateShipmentWizard({ onCreated }: CreateShipmentWizardProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<ShipmentWizardData>(initialShipmentWizardData);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdTrackingNumber, setCreatedTrackingNumber] = useState<string | null>(null);

  const progress = useMemo(() => ((step + 1) / stepLabels.length) * 100, [step]);

  const next = () => {
    const validation = validateStep(step, data);
    setErrors(validation);
    if (validation.length > 0) {
      return;
    }
    setStep((current) => Math.min(stepLabels.length - 1, current + 1));
  };

  const back = () => {
    setErrors([]);
    setStep((current) => Math.max(0, current - 1));
  };

  const createShipment = async () => {
    const validation = validateStep(3, data);
    setErrors(validation);
    if (validation.length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      const tracking = `FWD-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`;
      setCreatedTrackingNumber(tracking);
      onCreated?.(tracking);
    } finally {
      setSubmitting(false);
    }
  };

  if (createdTrackingNumber) {
    return (
      <ShipmentSuccessState
        trackingNumber={createdTrackingNumber}
        onCreateAnother={() => {
          setData(initialShipmentWizardData);
          setStep(0);
          setErrors([]);
          setCreatedTrackingNumber(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Create shipment</h3>
          <span className="text-xs text-gray-500">Step {step + 1} of {stepLabels.length}</span>
        </div>
        <div className="mb-3 h-2 rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-[var(--tenant-primary)] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <ol className="grid gap-2 sm:grid-cols-4">
          {stepLabels.map((label, index) => (
            <li key={label} className={`rounded-md px-3 py-2 text-xs ${index === step ? "bg-[var(--tenant-primary-light)] text-[var(--tenant-primary)] font-semibold" : "bg-gray-100 text-gray-600"}`}>
              {label}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 ? <StepAddresses data={data} onChange={setData} errors={errors} /> : null}
      {step === 1 ? <StepPackage data={data} onChange={setData} errors={errors} /> : null}
      {step === 2 ? <StepService data={data} onChange={setData} errors={errors} /> : null}
      {step === 3 ? <StepReview data={data} onJumpToStep={setStep} onTermsChange={(accepted) => setData({ ...data, termsAccepted: accepted })} errors={errors} /> : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" onClick={back} disabled={step === 0}>
          Back
        </Button>
        {step < stepLabels.length - 1 ? (
          <Button onClick={next}>Next</Button>
        ) : (
          <Button onClick={createShipment} loading={submitting} disabled={submitting}>
            Create Shipment
          </Button>
        )}
      </div>
    </div>
  );
}
