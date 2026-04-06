import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { TenantConfig } from "@/types/domain";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: string | number | Date, tenant?: TenantConfig | null) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(tenant?.locale || "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tenant?.timezone || "UTC"
  }).format(date);
}

export function formatCurrency(amount: number, tenant?: TenantConfig | null) {
  return new Intl.NumberFormat(tenant?.locale || "en-GB", {
    style: "currency",
    currency: tenant?.currency || "GBP"
  }).format(amount);
}
