import { isAxiosError } from "axios";

/** Normalised error for every console API failure (architecture §5). Pages render these; nothing is swallowed. */
export class ConsoleApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly permission?: string;
  readonly vendor?: string;
  readonly degraded?: boolean;
  readonly stepUp?: boolean;

  constructor(input: { status: number; code: string; message: string; permission?: string; vendor?: string; degraded?: boolean; stepUp?: boolean }) {
    super(input.message);
    this.name = "ConsoleApiError";
    this.status = input.status;
    this.code = input.code;
    this.permission = input.permission;
    this.vendor = input.vendor;
    this.degraded = input.degraded;
    this.stepUp = input.stepUp;
  }
}

type ErrorBody = { error?: unknown; code?: unknown; message?: unknown; permission?: unknown; vendor?: unknown; degraded?: unknown; stepUp?: unknown };

function str(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function toConsoleApiError(error: unknown): ConsoleApiError {
  if (error instanceof ConsoleApiError) return error;
  if (isAxiosError(error)) {
    if (!error.response) {
      return new ConsoleApiError({ status: 0, code: "NETWORK_ERROR", message: "The console API could not be reached. Check your connection and retry." });
    }
    const status = error.response.status;
    const body = (typeof error.response.data === "object" && error.response.data !== null ? error.response.data : {}) as ErrorBody;
    // Fastify sensible bodies put a human label in `error` and the detail in `message`; console routes put a CODE in `error`.
    const rawError = str(body.error);
    const code = str(body.code) ?? (rawError && /^[A-Z0-9_]+$/.test(rawError) ? rawError : undefined) ?? `HTTP_${status}`;
    const message = str(body.message) ?? rawError ?? `Request failed with status ${status}`;
    return new ConsoleApiError({
      status,
      code,
      message,
      permission: str(body.permission),
      vendor: str(body.vendor),
      degraded: body.degraded === true ? true : undefined,
      stepUp: body.stepUp === true ? true : undefined
    });
  }
  return new ConsoleApiError({ status: 0, code: "CLIENT_ERROR", message: error instanceof Error ? error.message : "Unexpected error" });
}

/** Human-readable message for an API failure, with a fallback for errors that carry none. */
export function apiErrorMessage(error: unknown, fallback: string) {
  const normalised = toConsoleApiError(error);
  if (normalised.status === 0 && normalised.code === "CLIENT_ERROR") return fallback;
  if (normalised.code === "Forbidden" || (normalised.status === 403 && normalised.permission)) {
    return normalised.permission ? `Requires ${normalised.permission}` : normalised.message;
  }
  return normalised.message || fallback;
}
