export type TenantRouteOption = {
  id: string;
  label: string;
  description: string;
};

const ROUTE_OPTIONS_STORAGE_KEY = "fw-route-options";

export const defaultRouteOptions: TenantRouteOption[] = [
  {
    id: "route-lagos-a",
    label: "Lagos Route A",
    description: "Central Lagos pickup and urban final-mile delivery corridor."
  },
  {
    id: "route-abuja-b",
    label: "Abuja Route B",
    description: "Abuja commercial district route for daytime dispatch loads."
  },
  {
    id: "route-london-c",
    label: "London Route C",
    description: "Inner London route for premium and same-day delivery work."
  }
];

export function loadRouteOptions(): TenantRouteOption[] {
  if (typeof window === "undefined") {
    return defaultRouteOptions;
  }

  try {
    const raw = window.localStorage.getItem(ROUTE_OPTIONS_STORAGE_KEY);
    if (!raw) {
      return defaultRouteOptions;
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultRouteOptions;
  } catch {
    return defaultRouteOptions;
  }
}

export function saveRouteOptions(options: TenantRouteOption[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ROUTE_OPTIONS_STORAGE_KEY, JSON.stringify(options));
}
