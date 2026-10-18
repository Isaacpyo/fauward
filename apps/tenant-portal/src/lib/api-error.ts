import { isAxiosError } from "axios";

type ApiErrorBody = { error?: unknown; message?: unknown; reason?: unknown };

/** The server's error code (`error`), when the response carries one. */
export function apiErrorCode(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const body = error.response?.data as ApiErrorBody | undefined;
  return typeof body?.error === "string" ? body.error : null;
}

/** A human-readable message from an API error: the server's message, then its error code, then the fallback. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    for (const value of [body?.message, body?.reason, body?.error]) {
      if (typeof value === "string" && value.trim()) return value;
    }
    if (!error.response) return "The server could not be reached. Check your connection and try again.";
  }
  return fallback;
}
