import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { api } from "@/lib/api";

export type BrandingPayload = {
  primaryColor: string;
  accentColor?: string;
  brandName: string;
  logoUrl?: string;
  supportEmail?: string;
  trackingHeadline?: string;
};

export type BrandingFieldErrors = Partial<Record<keyof BrandingPayload, string>>;

export class BrandingValidationError extends Error {
  readonly fieldErrors: BrandingFieldErrors;
  constructor(fieldErrors: BrandingFieldErrors, message = "Branding validation failed") {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

type ZodIssue = { path: (string | number)[]; message: string };

function extractFieldErrors(err: unknown): BrandingFieldErrors {
  if (!(err instanceof AxiosError) || err.response?.status !== 400) return {};
  const body = err.response.data as { issues?: ZodIssue[]; message?: string };
  const errors: BrandingFieldErrors = {};
  if (Array.isArray(body?.issues)) {
    for (const issue of body.issues) {
      const key = issue.path?.[0];
      if (typeof key === "string") {
        errors[key as keyof BrandingPayload] = issue.message;
      }
    }
  }
  return errors;
}

export function useUpdateBranding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BrandingPayload) => {
      try {
        const response = await api.patch("/v1/tenant/branding", payload);
        return response.data;
      } catch (err) {
        const fieldErrors = extractFieldErrors(err);
        if (Object.keys(fieldErrors).length > 0) {
          throw new BrandingValidationError(fieldErrors);
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-config"] });
    }
  });
}
