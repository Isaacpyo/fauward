import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type OnboardingStepperProps = {
  currentStep: number;
  labels: string[];
};

export function OnboardingStepper({ currentStep, labels }: OnboardingStepperProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="hidden items-center gap-2 sm:flex">
        {labels.map((label, index) => {
          const completed = index < currentStep;
          const active = index === currentStep;
          return (
            <div key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold",
                  completed
                    ? "border-[var(--color-success)] bg-[var(--color-success)] text-white"
                    : active
                      ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary)] text-white"
                      : "border-gray-300 bg-white text-gray-500"
                )}
              >
                {completed ? <Check size={14} /> : index + 1}
              </span>
              <span className={cn("text-sm", active ? "font-semibold text-gray-900" : "text-gray-600")}>{label}</span>
              {index < labels.length - 1 ? <span className="h-px flex-1 bg-gray-200" /> : null}
            </div>
          );
        })}
      </div>
      <div className="sm:hidden">
        <p className="text-xs text-gray-500">Step {currentStep + 1} of {labels.length}</p>
        <p className="mt-1 text-sm font-semibold text-gray-900">{labels[currentStep]}</p>
      </div>
    </div>
  );
}
