import { UploadCloud } from "lucide-react";
import { useRef } from "react";

import { BrandPreview } from "@/components/onboarding/BrandPreview";
import { Input } from "@/components/ui/Input";
import type { OnboardingState } from "@/components/onboarding/types";

type StepBrandingProps = {
  state: OnboardingState;
  onChange: (state: OnboardingState) => void;
};

export function StepBranding({ state, onChange }: StepBrandingProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const applyFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      return;
    }
    onChange({
      ...state,
      logoFile: file,
      logoPreview: URL.createObjectURL(file)
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
      <div className="space-y-4">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Brand your platform</h2>
          <p className="mt-1 text-sm text-gray-600">Upload your logo, set your company name, and choose primary color.</p>

          <div className="mt-4 space-y-4">
            <div
              className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                applyFile(event.dataTransfer.files?.[0]);
              }}
            >
              <UploadCloud size={20} className="mx-auto text-gray-500" />
              <p className="mt-2 text-sm text-gray-700">Drag and drop logo file or upload</p>
              <p className="mt-1 text-xs text-gray-500">PNG, JPG, SVG up to 2MB</p>
              <input
                ref={fileRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                className="hidden"
                onChange={(event) => applyFile(event.target.files?.[0])}
              />
              <button
                type="button"
                className="mt-3 rounded-md border border-gray-300 px-3 py-2 text-sm"
                onClick={() => fileRef.current?.click()}
              >
                Upload logo
              </button>
            </div>

            <Input
              placeholder="Company name"
              value={state.companyName}
              onChange={(event) => onChange({ ...state, companyName: event.target.value })}
            />

            <div className="grid gap-3 sm:grid-cols-[120px,1fr]">
              <input
                type="color"
                value={state.primaryColor}
                onChange={(event) => onChange({ ...state, primaryColor: event.target.value })}
                className="h-11 w-full rounded-md border border-gray-300 bg-white"
              />
              <Input
                value={state.primaryColor}
                onChange={(event) => onChange({ ...state, primaryColor: event.target.value })}
              />
            </div>
          </div>
        </section>
      </div>

      <BrandPreview companyName={state.companyName} logoUrl={state.logoPreview} primaryColor={state.primaryColor} />
    </div>
  );
}
