import { isPlatformHost, isPortalOwnedFauwardHost, isVercelPreviewHost } from "./hostRules";
import { normalizeHost } from "./resolveTenantByHost";

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

function isValidLabel(label: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}

export function normalizeDomainInput(input: string): string {
  const host = normalizeHost(input.replace(/\.$/, ""));
  if (!host || host.includes("/") || host.includes("*") || host.length > 253) {
    throw new DomainValidationError("Invalid domain");
  }

  const labels = host.split(".");
  if (labels.length < 3 || labels.some((label) => !isValidLabel(label))) {
    throw new DomainValidationError("Use a tenant-owned subdomain such as ship.example.com");
  }

  if (isPlatformHost(host) || isPortalOwnedFauwardHost(host) || isVercelPreviewHost(host)) {
    throw new DomainValidationError("This host is reserved for another Fauward surface");
  }

  return host;
}

export function cnameRecordName(domain: string): string {
  return domain.split(".")[0] ?? domain;
}
